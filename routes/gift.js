const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ✅ API Test endpoint
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 API test endpoint çağrıldı');
    
    const result = await pool.query('SELECT COUNT(*) as count FROM categories WHERE is_active = true');
    const categoryCount = parseInt(result.rows[0].count);
    
    res.json({
      success: true,
      message: 'API çalışıyor',
      data: {
        categoryCount,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ API test hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'API test başarısız',
      details: error.message 
    });
  }
});

// 🏠 1. ADIM: Recipient seçimi sonrası ANA KATEGORİLERİ getir
router.get('/main-categories/:recipientId', async (req, res) => {
  try {
    const { recipientId } = req.params;
    console.log(`🏠 RecipientId ${recipientId} için ANA kategoriler çekiliyor...`);
    
    const result = await pool.query(`
      SELECT DISTINCT c.id, c.name, c.description, c.icon, c.color,
             COUNT(DISTINCT subcat.id) AS subcategory_count
      FROM categories c
      INNER JOIN recipient_categories rc ON c.id = rc.category_id
      LEFT JOIN categories subcat ON subcat.parent_id = c.id AND subcat.is_active = true
      WHERE rc.recipient_id = $1
        AND c.is_active = true
        AND c.parent_id IS NULL
      GROUP BY c.id, c.name, c.description, c.icon, c.color
      HAVING COUNT(DISTINCT subcat.id) > 0
      ORDER BY c.id ASC
    `, [recipientId]);
    
    console.log(`✅ Ana kategoriler bulundu: ${result.rows.length} adet`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: `${result.rows.length} ana kategori bulundu`
    });
    
  } catch (error) {
    console.error('❌ Ana kategoriler fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ana kategoriler yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 📂 2. ADIM: Ana kategori seçimi sonrası ALT KATEGORİLERİ getir
router.get('/sub-categories/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;
    console.log(`📂 ParentId ${parentId} için ALT kategoriler çekiliyor...`);
    
    const result = await pool.query(`
      SELECT c.id, c.name, c.description, c.icon, c.color,
             COUNT(DISTINCT p.id) AS product_count
      FROM categories c
      LEFT JOIN product_categories pc ON c.id = pc.category_id
      LEFT JOIN products p ON pc.product_id = p.id AND p.stock > 0
      WHERE c.parent_id = $1
        AND c.is_active = true
      GROUP BY c.id, c.name, c.description, c.icon, c.color
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY c.id ASC
    `, [parentId]);
    
    console.log(`✅ Alt kategoriler bulundu: ${result.rows.length} adet`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: `${result.rows.length} alt kategori bulundu`
    });
    
  } catch (error) {
    console.error('❌ Alt kategoriler fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Alt kategoriler yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🛍️ 3. ADIM: Alt kategori seçimi sonrası ÜRÜNLERİ getir
router.get('/products/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    console.log(`🛍️ CategoryId ${categoryId} için ürünler çekiliyor...`);
    
    const result = await pool.query(`
      SELECT DISTINCT p.id, p.name, p.description, p.price,
             p.image_url, p.stock AS stock_quantity,
             COALESCE(p.discount, 0) AS discount,
             COALESCE(p.rating, 4.5) AS rating,
             p.created_at, p.updated_at,
             ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS themes
      FROM products p
      INNER JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN product_themes pt ON p.id = pt.product_id
      LEFT JOIN themes t ON pt.theme_id = t.id AND t.is_active = true
      WHERE pc.category_id = $1
        AND p.stock > 0
      GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.stock, p.discount, p.rating, p.created_at, p.updated_at
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $2
    `, [categoryId, limit]);
    
    console.log(`✅ Ürünler bulundu: ${result.rows.length} adet`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: `${result.rows.length} ürün bulundu`
    });
    
  } catch (error) {
    console.error('❌ Ürünler fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ürünler yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🔍 Ürün arama endpoint'i
router.get('/search', async (req, res) => {
  try {
    const { q, category, theme, limit = 20 } = req.query;
    
    console.log('🔍 Ürün arama:', { q, category, theme, limit });
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'En az 2 karakter giriniz'
      });
    }
    
    let baseQuery = `
      SELECT DISTINCT p.id, p.name, p.description, p.price,
             p.image_url, p.stock as stock_quantity,
             COALESCE(p.discount, 0) as discount,
             COALESCE(p.rating, 4.5) as rating,
             ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories,
             ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as themes
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.id
      LEFT JOIN product_themes pt ON p.id = pt.product_id
      LEFT JOIN themes t ON pt.theme_id = t.id
      WHERE p.stock > 0 
        AND (p.name ILIKE $1 OR p.description ILIKE $1)
    `;
    
    let queryParams = [`%${q.trim()}%`];
    let paramIndex = 2;
    
    if (category) {
      baseQuery += ` AND pc.category_id = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    if (theme) {
      baseQuery += ` AND pt.theme_id = $${paramIndex}`;
      queryParams.push(theme);
      paramIndex++;
    }
    
    baseQuery += `
      GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.stock, p.discount, p.rating
      ORDER BY p.name ASC
      LIMIT $${paramIndex}
    `;
    
    queryParams.push(limit);
    
    const result = await pool.query(baseQuery, queryParams);
    
    console.log('✅ Arama sonucu:', result.rows.length, 'ürün bulundu');
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      query: q
    });
    
  } catch (error) {
    console.error('❌ Search hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Arama sırasında hata oluştu',
      details: error.message 
    });
  }
});

// 📊 Debug endpoint - Hiyerarşik yapı kontrolü
router.get('/debug/hierarchy/:recipientId', async (req, res) => {
  try {
    const { recipientId } = req.params;
    
    const mainCats = await pool.query(`
      SELECT c.id, c.name, 
             COUNT(DISTINCT subcat.id) as subcategory_count
      FROM categories c
      INNER JOIN recipient_categories rc ON c.id = rc.category_id
      LEFT JOIN categories subcat ON subcat.parent_id = c.id AND subcat.is_active = true
      WHERE rc.recipient_id = $1 
        AND c.is_active = true 
        AND c.parent_id IS NULL
      GROUP BY c.id, c.name
      ORDER BY c.id ASC
    `, [recipientId]);
    
    const hierarchy = {};
    
    for (const mainCat of mainCats.rows) {
      const subCats = await pool.query(`
        SELECT c.id, c.name,
               COUNT(DISTINCT p.id) as product_count
        FROM categories c
        LEFT JOIN product_categories pc ON c.id = pc.category_id
        LEFT JOIN products p ON pc.product_id = p.id AND p.stock > 0
        WHERE c.parent_id = $1 AND c.is_active = true
        GROUP BY c.id, c.name
        ORDER BY c.id ASC
      `, [mainCat.id]);
      
      hierarchy[mainCat.name] = {
        id: mainCat.id,
        subcategories: subCats.rows
      };
    }
    
    res.json({
      success: true,
      data: hierarchy,
      message: 'Hiyerarşik yapı başarıyla alındı'
    });
    
  } catch (error) {
    console.error('❌ Hierarchy debug hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Hiyerarşi bilgileri alınırken hata oluştu',
      details: error.message 
    });
  }
});

module.exports = router;
