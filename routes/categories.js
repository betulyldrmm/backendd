// 1. routes/categories.js - PostgreSQL Backend API Route'ları
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL bağlantısı
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'bet2516',
  database: 'shopmind_db',
  port: 5432,
});

// Tüm kategorileri getir
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        id, 
        name, 
        slug, 
        description, 
        icon, 
        image_url,
        is_active,
        sort_order
      FROM categories 
      WHERE is_active = true 
      ORDER BY sort_order ASC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Kategori listesi alınamadı:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler alınamadı',
      error: error.message
    });
  }
});

// Kategoriye göre ürünleri getir - CategoryPage için

router.get('/:slug/products', async (req, res) => {
  try {
    const { slug } = req.params;
    const { 
      sortBy = 'newest', 
      priceMin = 0, 
      priceMax = 99999,
      page = 1,
      limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let orderBy = 'p.created_at DESC';
    switch (sortBy) {
      case 'price-low':
        orderBy = 'p.price ASC';
        break;
      case 'price-high':
        orderBy = 'p.price DESC';
        break;
      case 'popular':
        orderBy = 'p.view_count DESC';
        break;
      case 'rating':
        orderBy = 'p.rating DESC';
        break;
    }
    
    const query = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.discount,
        p.stock,
        p.image_url,
        p.rating,
        p.view_count,
        p.created_at,
        c.name as category_name,
        c.slug as category_slug
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE c.slug = $1 
        AND p.is_active = true 
        AND c.is_active = true
        AND p.price BETWEEN $2 AND $3
      ORDER BY ${orderBy}
      LIMIT $4 OFFSET $5
    `;
    
    const result = await pool.query(query, [
      slug, 
      priceMin, 
      priceMax, 
      parseInt(limit), 
      parseInt(offset)
    ]);
    
    // Kategori bilgisini de gönder
    const categoryQuery = `
      SELECT name, slug, description, image_url
      FROM categories 
      WHERE slug = $1 AND is_active = true
    `;
    const categoryResult = await pool.query(categoryQuery, [slug]);
    
    // Alt kategorileri de gönder - şimdilik statik veriler
    const subCategories = [];
    if (slug === 'moda') {
      subCategories.push(
        { name: 'Kadın Giyim', slug: 'kadin-giyim' },
        { name: 'Erkek Giyim', slug: 'erkek-giyim' },
        { name: 'Ayakkabılar', slug: 'ayakkabilar' },
        { name: 'Aksesuarlar', slug: 'aksesuarlar' }
      );
    } else if (slug === 'elektronik') {
      subCategories.push(
        { name: 'Telefonlar', slug: 'telefonlar' },
        { name: 'Bilgisayarlar', slug: 'bilgisayarlar' },
        { name: 'Kamera', slug: 'kamera' },
        { name: 'Ev Elektroniği', slug: 'ev-elektronigi' }
      );
    } else if (slug === 'spor') {
      subCategories.push(
        { name: 'Spor Giyim', slug: 'spor-giyim' },
        { name: 'Outdoor', slug: 'outdoor' },
        { name: 'Fitness Ekipmanları', slug: 'fitness' },
        { name: 'Bisiklet', slug: 'bisiklet' }
      );
    } else if (slug === 'kozmetik') {
      subCategories.push(
        { name: 'Makyaj', slug: 'makyaj' },
        { name: 'Cilt Bakımı', slug: 'cilt-bakimi' },
        { name: 'Saç Bakımı', slug: 'sac-bakimi' },
        { name: 'Parfüm', slug: 'parfum' }
      );
    } else if (slug === 'kitap') {
      subCategories.push(
        { name: 'Roman', slug: 'roman' },
        { name: 'Eğitim', slug: 'egitim-kitaplari' },
        { name: 'Defter & Kalem', slug: 'defter-kalem' },
        { name: 'Sanat Malzemeleri', slug: 'sanat-malzemeleri' }
      );
    } else if (slug === 'cocuk') {
      subCategories.push(
        { name: 'Oyuncaklar', slug: 'oyuncaklar' },
        { name: 'Giyim', slug: 'cocuk-giyim' },
        { name: 'Kitaplar', slug: 'cocuk-kitaplari' },
        { name: 'Okul Malzemeleri', slug: 'okul-malzemeleri' }
      );
    } else if (slug === 'bebek') {
      subCategories.push(
        { name: 'Bebek Bezi', slug: 'bebek-bezi' },
        { name: 'Bebek Giyim', slug: 'bebek-giyim' },
        { name: 'Mama & Beslenme', slug: 'mama-beslenme' },
        { name: 'Oyun & Aktivite', slug: 'bebek-oyun' }
      );
    } else if (slug === 'gida') {
      subCategories.push(
        { name: 'Atıştırmalıklar', slug: 'atistirmaliklar' },
        { name: 'İçecekler', slug: 'icecekler' },
        { name: 'Organik Ürünler', slug: 'organik' },
        { name: 'Süt & Süt Ürünleri', slug: 'sut-urunleri' }
      );
    }
    
    res.json({
      success: true,
      data: {
        category: categoryResult.rows[0] || null,
        subCategories,
        products: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rows.length
        }
      }
    });
  } catch (error) {
    console.error('Kategori ürünleri alınamadı:', error);
    res.status(500).json({
      success: false,
      message: 'Ürünler alınamadı',
      error: error.message
    });
  }
});

// Alt kategoriye göre ürünleri getir (şimdilik çalışmayacak - subcategories tablosu yok)
router.get('/categories/:categorySlug/:subSlug/products', async (req, res) => {
  try {
    // Alt kategori sistemi henüz aktif değil
    res.json({
      success: false,
      message: 'Alt kategori sistemi henüz aktif değil'
    });
  } catch (error) {
    console.error('Alt kategori ürünleri alınamadı:', error);
    res.status(500).json({
      success: false,
      message: 'Ürünler alınamadı',
      error: error.message
    });
  }
});

module.exports = router;

