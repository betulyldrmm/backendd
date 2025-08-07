const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ✅ API Test endpoint - Sistem çalışıyor mu kontrol et
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 API test endpoint çağrıldı');
    
    // Veritabanı bağlantısını test et
    const result = await pool.query('SELECT COUNT(*) as count FROM categories WHERE is_active = true');
    const categoryCount = parseInt(result.rows[0].count);
    
    res.json({
      success: true,
      message: 'Hediye sistemi API çalışıyor! 🎁',
      data: {
        categoryCount: categoryCount,
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

// 👥 Hediye alıcı tiplerini getir (Anne, Baba, Sevgili, Arkadaş vs.)
router.get('/recipients', async (req, res) => {
  try {
    console.log('👥 Hediye alıcı tipleri çekiliyor...');
    
    const result = await pool.query(`
      SELECT id, name, description, icon, color, age_range, gender
      FROM recipients 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    console.log('✅ Bulunan alıcı tipi sayısı:', result.rows.length);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Recipients fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Alıcı tipleri yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 📂 Hediye kategorilerini getir (Teknoloji, Moda, Kitap vs.)
router.get('/categories', async (req, res) => {
  try {
    console.log('📂 Hediye kategorileri çekiliyor...');
    
    const result = await pool.query(`
      SELECT c.id, c.name, c.description, c.icon, c.color,
             COUNT(DISTINCT p.id) as product_count
      FROM categories c
      LEFT JOIN product_categories pc ON c.id = pc.category_id
      LEFT JOIN products p ON pc.product_id = p.id AND p.stock > 0
      WHERE c.is_active = true
      GROUP BY c.id, c.name, c.description, c.icon, c.color
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY c.name ASC
    `);
    
    console.log('✅ Kategoriler yüklendi:', result.rows.length, 'adet');
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Categories fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Kategoriler yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🎨 Kategori için temaları getir
router.get('/themes/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log('🎨 CategoryId', categoryId, 'için temalar çekiliyor...');
    
    const result = await pool.query(`
      SELECT DISTINCT t.id, t.name, t.description, t.color, t.icon,
             COUNT(DISTINCT p.id) as product_count
      FROM themes t
      JOIN product_themes pt ON t.id = pt.theme_id
      JOIN products p ON pt.product_id = p.id
      JOIN product_categories pc ON p.id = pc.product_id
      WHERE pc.category_id = $1 AND p.stock > 0
      GROUP BY t.id, t.name, t.description, t.color, t.icon
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY t.name ASC
    `, [categoryId]);
    
    console.log('✅ CategoryId', categoryId, 'için bulunan tema sayısı:', result.rows.length);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Themes fetch hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Temalar yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🛍️ HEDIYE ÖNERİLERİ - Kategoriye göre ürünleri getir (RESİMLERLE) - DÜZELTİLMİŞ
// 🛍️ HEDIYE ÖNERİLERİ - DEBUG EDİLMİŞ VERSİYON
// 🛍️ GELİŞTİRİLMİŞ HEDIYE ÖNERİLERİ - Mantıklı filtreleme
router.post('/recommendations', async (req, res) => {
  try {
    const { categoryId, themeId, limit = 20 } = req.body;
    
    console.log('🛍️ Hediye önerileri çağrıldı:', { categoryId, themeId, limit });

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        error: 'Kategori seçmelisiniz!'
      });
    }

    // Kategori adını al - filtreleme için
    const categoryResult = await pool.query(`
      SELECT name FROM categories WHERE id = $1 AND is_active = true
    `, [categoryId]);
    
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz kategori!'
      });
    }
    
    const categoryName = categoryResult.rows[0].name.toLowerCase();
    console.log('📂 Kategori adı:', categoryName);

    let queryParams = [categoryId];
    let paramCount = 1;
    
    // TEMEL SORGU - sadece kategoriye göre filtrele
    let baseQuery = `
      SELECT p.id, p.name, p.description, p.price,
             p.image_url, p.stock as stock_quantity,
             COALESCE(p.discount, 0) as discount,
             COALESCE(p.rating, 4.5) as rating,
             p.created_at, p.updated_at,
             ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories,
             ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as themes
      FROM products p
      INNER JOIN product_categories pc ON p.id = pc.product_id
      INNER JOIN categories c ON pc.category_id = c.id
      LEFT JOIN product_themes pt ON p.id = pt.product_id
      LEFT JOIN themes t ON pt.theme_id = t.id
      WHERE p.stock > 0 
        AND c.is_active = true 
        AND pc.category_id = $1
        AND p.image_url IS NOT NULL
        AND p.image_url != ''
    `;

    // KATEGORİYE GÖRE MANTIKLI FİLTRELEME
    if (categoryName.includes('elektronik') || categoryName.includes('teknoloji')) {
      // Elektronik ürünleri için alakasız temaları filtrele
      baseQuery += ` AND NOT EXISTS (
        SELECT 1 FROM product_themes pt2 
        JOIN themes t2 ON pt2.theme_id = t2.id
        WHERE pt2.product_id = p.id 
        AND (t2.name ILIKE '%kedi%' OR t2.name ILIKE '%harry potter%' OR t2.name ILIKE '%aşk%')
      )`;
    }
    
    if (categoryName.includes('kitap')) {
      // Kitap kategorisi için alakasız temaları filtrele  
      baseQuery += ` AND NOT EXISTS (
        SELECT 1 FROM product_themes pt2 
        JOIN themes t2 ON pt2.theme_id = t2.id
        WHERE pt2.product_id = p.id 
        AND (t2.name ILIKE '%elektronik%' OR t2.name ILIKE '%oyun%' OR t2.name ILIKE '%spor%')
      )`;
      
      // Kitap isimlerini tercih et
      baseQuery += ` AND (p.name ILIKE '%roman%' OR p.name ILIKE '%kitap%' OR p.name ILIKE '%suç%' OR p.name ILIKE '%aşk%')`;
    }
    
    if (categoryName.includes('ev') || categoryName.includes('dekorasyon')) {
      // Ev dekorasyon için alakalı ürünleri tercih et
      baseQuery += ` AND (p.name ILIKE '%mobilya%' OR p.name ILIKE '%koltuk%' OR p.name ILIKE '%masa%' OR p.name ILIKE '%dekor%' OR p.name ILIKE '%ev%')`;
    }

    // Tema filtresi varsa ve mantıklıysa ekle
    if (themeId && themeId !== 'null' && themeId !== '' && themeId !== null) {
      // Önce temanın bu kategoriye uygun olup olmadığını kontrol et
      const themeCheck = await pool.query(`
        SELECT t.name, COUNT(DISTINCT p.id) as product_count
        FROM themes t
        JOIN product_themes pt ON t.id = pt.theme_id
        JOIN products p ON pt.product_id = p.id
        JOIN product_categories pc ON p.id = pc.product_id
        WHERE t.id = $1 AND pc.category_id = $2
        GROUP BY t.name
      `, [themeId, categoryId]);
      
      if (themeCheck.rows.length > 0 && themeCheck.rows[0].product_count > 0) {
        paramCount++;
        baseQuery += ` AND EXISTS (
          SELECT 1 FROM product_themes pt2 
          WHERE pt2.product_id = p.id AND pt2.theme_id = $${paramCount}
        )`;
        queryParams.push(themeId);
        console.log('✅ Tema filtresi eklendi:', themeCheck.rows[0].name);
      } else {
        console.log('⚠️ Tema bu kategori için uygun değil, atlanıyor...');
      }
    }

    // GROUP BY ve ORDER BY ekle
    baseQuery += `
      GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.stock, 
               p.discount, p.rating, p.created_at, p.updated_at
      ORDER BY 
        CASE 
          WHEN p.name ILIKE '%${categoryName}%' THEN 1 
          ELSE 2 
        END,
        COALESCE(p.rating, 4.5) DESC, 
        p.created_at DESC
    `;
    
    // LIMIT ekle
    paramCount++;
    baseQuery += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    console.log('📊 SQL sorgusu hazırlandı...');
    console.log('📝 Parameters:', queryParams);

    const result = await pool.query(baseQuery, queryParams);
    
    console.log('✅ Hediye önerileri başarılı! Bulunan ürün sayısı:', result.rows.length);

    // Sonuçları kontrol et ve raporla
    if (result.rows.length > 0) {
      console.log('🎯 İlk birkaç ürün:');
      result.rows.slice(0, 3).forEach((product, index) => {
        console.log(`${index + 1}. ${product.name} - ${product.categories}`);
      });
    }

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: `${categoryResult.rows[0].name} kategorisinde${themeId ? ' ve seçilen temada' : ''} uygun ürün bulunamadı. Lütfen farklı tema deneyin. 🤔`
      });
    }

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: `${result.rows.length} adet ${categoryResult.rows[0].name} hediyesi bulundu! 🎁`,
      category: categoryResult.rows[0].name
    });
    
  } catch (error) {
    console.error('❌ Hediye önerileri hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Hediye önerileri yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🔍 TÜM ÜRÜNLER - Veritabanındaki tüm resimleri göster - DÜZELTİLMİŞ
router.get('/all', async (req, res) => {
  try {
    const { page = 1, limit = 50, category, search } = req.query;
    const offset = (page - 1) * limit;
    
    console.log('🔍 Tüm ürünler çekiliyor...', { page, limit, category, search });
    
    let baseQuery = `
      SELECT p.id, p.name, p.description, p.price,
             p.image_url, p.stock as stock_quantity,
             COALESCE(p.discount, 0) as discount,
             COALESCE(p.rating, 4.5) as rating,
             p.brand, p.color, p.created_at,
             ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.id
      WHERE p.stock > 0 
        AND p.image_url IS NOT NULL 
        AND p.image_url != ''
    `;
    
    let queryParams = [];
    let paramIndex = 1;
    
    // Kategori filtresi
    if (category) {
      baseQuery += ` AND pc.category_id = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    // Arama filtresi
    if (search && search.trim()) {
      baseQuery += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    baseQuery += `
      GROUP BY p.id, p.name, p.description, p.price, p.image_url, 
               p.stock, p.discount, p.rating, p.brand, p.color, p.created_at
      ORDER BY COALESCE(p.rating, 4.5) DESC, p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await pool.query(baseQuery, queryParams);
    
    // Toplam sayıyı al - DÜZELTİLMİŞ
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      WHERE p.stock > 0 AND p.image_url IS NOT NULL AND p.image_url != ''
    `;
    
    let countParams = [];
    let countIndex = 1;
    
    if (category) {
      countQuery += ` AND pc.category_id = $${countIndex}`;
      countParams.push(category);
      countIndex++;
    }
    
    if (search && search.trim()) {
      countQuery += ` AND (p.name ILIKE $${countIndex} OR p.description ILIKE $${countIndex})`;
      countParams.push(`%${search.trim()}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalProducts = parseInt(countResult.rows[0].total);
    
    console.log('✅ Tüm ürünler yüklendi:', result.rows.length, '/', totalProducts);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      total: totalProducts,
      page: parseInt(page),
      totalPages: Math.ceil(totalProducts / limit),
      message: `${totalProducts} adet ürün bulundu! 📦`
    });
    
  } catch (error) {
    console.error('❌ Tüm ürünler hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ürünler yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 🔍 Ürün detayı getir
router.get('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz ürün ID formatı'
      });
    }
    
    console.log('🔍 Ürün detayı çekiliyor, ID:', id);
    
    const result = await pool.query(`
      SELECT p.*, 
             ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories,
             ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as themes
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.id
      LEFT JOIN product_themes pt ON p.id = pt.product_id
      LEFT JOIN themes t ON pt.theme_id = t.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ürün bulunamadı'
      });
    }
    
    console.log('✅ Ürün detayı bulundu:', result.rows[0].name);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Product detail hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ürün detayı yüklenirken hata oluştu',
      details: error.message 
    });
  }
});

// 📊 Veritabanı istatistikleri
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Veritabanı istatistikleri çekiliyor...');
    
    const results = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock > 0'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock > 0 AND image_url IS NOT NULL'),
      pool.query('SELECT COUNT(*) as count FROM categories WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as count FROM themes WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as count FROM recipients WHERE is_active = true'),
      pool.query(`
        SELECT c.name, COUNT(p.id) as product_count
        FROM categories c
        LEFT JOIN product_categories pc ON c.id = pc.category_id
        LEFT JOIN products p ON pc.product_id = p.id AND p.stock > 0
        WHERE c.is_active = true
        GROUP BY c.name
        ORDER BY product_count DESC
        LIMIT 10
      `)
    ]);
    
    const stats = {
      totalProducts: parseInt(results[0].rows[0].count),
      productsWithImages: parseInt(results[1].rows[0].count),
      totalCategories: parseInt(results[2].rows[0].count),
      totalThemes: parseInt(results[3].rows[0].count),
      totalRecipients: parseInt(results[4].rows[0].count),
      topCategories: results[5].rows
    };
    
    console.log('✅ İstatistikler hazırlandı:', stats);
    
    res.json({
      success: true,
      data: stats,
      message: 'Hediye sistemi istatistikleri 📈'
    });
    
  } catch (error) {
    console.error('❌ Stats hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'İstatistikler alınırken hata oluştu',
      details: error.message 
    });
  }
});

module.exports = router;