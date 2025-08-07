

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();


const commentsRouter = require('./routes/comments');

// CORS ayarları
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://127.0.0.1:5173', 
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5174'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));


app.options('*', cors());

app.use(express.json());


app.use('/api/comments', commentsRouter);


const pool = new Pool({
  user: 'postgres',          
  host: 'localhost',         
  database: 'shopmind_db',   
  password: 'bet2516', 
  port: 5432,               
  max: 20,                  
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 2000, 
});

async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL bağlantısı başarılı');
    
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone VARCHAR(20),
        birth_date DATE,
        profile_image VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        icon VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

 
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        image_url VARCHAR(500),
        stock INTEGER DEFAULT 0,
        discount DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    
    await client.query(`
      CREATE TABLE IF NOT EXISTS popular_products (
        product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        rank INTEGER DEFAULT 0
      )
    `);
    
  
    const categoryCheck = await client.query('SELECT COUNT(*) FROM categories');
    if (parseInt(categoryCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO categories (name, slug, description) VALUES 
        ('Spor', 'spor', 'Spor ürünleri ve ekipmanları'),
        ('Teknoloji', 'teknoloji', 'Bilgisayar, telefon ve teknoloji ürünleri'),
        ('Kitap', 'kitap', 'Kitaplar ve eğitim materyalleri'),
        ('Otomobil', 'otomobil', 'Araç ve otomobil ürünleri')
      `);
      console.log('✅ Varsayılan kategoriler eklendi');
    }
    
    console.log('✅ Users tablosu hazır');
    console.log('✅ Products tablosu hazır');
    console.log('✅ Categories tablosu hazır');
    console.log('✅ Popular Products tablosu hazır');
    client.release();
    
  } catch (error) {
    console.error('❌ PostgreSQL bağlantı hatası:', error.message);
    process.exit(1);
  }
}


app.use('/images', express.static('public/images'));

// =============================================
// PROFİL API ENDPOINTS - BAŞTA OLMALI
// =============================================


app.get('/api/users/:id/profile', async (req, res) => {
  console.log('👤 Profil bilgileri istendi, ID:', req.params.id);
  
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT id, username, email, first_name, last_name, phone, birth_date, profile_image, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kullanıcı bulunamadı'
      });
    }
    
    const user = result.rows[0];
    console.log('✅ Profil bilgileri getirildi:', user.username);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        birthDate: user.birth_date,
        profileImage: user.profile_image,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Profil bilgileri alınırken hata:', error);
    res.status(500).json({
      success: false,
      error: 'Profil bilgileri alınamadı'
    });
  }
});

// Kullanıcı istatistiklerini getir
app.get('/api/users/:id/stats', async (req, res) => {
  console.log('📊 Kullanıcı istatistikleri istendi, ID:', req.params.id);
  
  const { id } = req.params;
  
  try {
  
    const userCheck = await pool.query('SELECT id, created_at FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kullanıcı bulunamadı'
      });
    }
    
    const user = userCheck.rows[0];
    const membershipDays = Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24));
    
    
    const stats = {
      totalOrders: Math.floor(Math.random() * 20) + 1,
      totalSpent: (Math.random() * 5000 + 100).toFixed(2),
      favoriteProducts: Math.floor(Math.random() * 10) + 1,
      membershipDays: membershipDays || 1
    };
    
    console.log('✅ Kullanıcı istatistikleri getirildi');
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ Kullanıcı istatistikleri alınırken hata:', error);
    res.status(500).json({
      success: false,
      error: 'İstatistikler alınamadı'
    });
  }
});

app.put('/api/users/:id/profile', async (req, res) => {
  console.log('✏️ Profil güncelleme istendi, ID:', req.params.id);
  
  const { id } = req.params;
  const { firstName, lastName, phone, birthDate, profileImage } = req.body;
  
  try {
   
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kullanıcı bulunamadı'
      });
    }
    
 
    const result = await pool.query(`
      UPDATE users 
      SET 
        first_name = $1,
        last_name = $2,
        phone = $3,
        birth_date = $4,
        profile_image = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, username, email, first_name, last_name, phone, birth_date, profile_image, updated_at
    `, [firstName, lastName, phone, birthDate, profileImage, id]);
    
    const updatedUser = result.rows[0];
    console.log('✅ Profil güncellendi:', updatedUser.username);
    
    res.json({
      success: true,
      message: 'Profil başarıyla güncellendi',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        phone: updatedUser.phone,
        birthDate: updatedUser.birth_date,
        profileImage: updatedUser.profile_image,
        updatedAt: updatedUser.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Profil güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      error: 'Profil güncellenemedi'
    });
  }
});


app.put('/api/users/:id/change-password', async (req, res) => {
  console.log('🔐 Şifre değiştirme istendi, ID:', req.params.id);
  
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    console.log('❌ Mevcut şifre veya yeni şifre boş');
    return res.status(400).json({
      success: false,
      error: 'Mevcut şifre ve yeni şifre gerekli'
    });
  }
  
  if (newPassword.length < 6) {
    console.log('❌ Yeni şifre çok kısa');
    return res.status(400).json({
      success: false,
      error: 'Yeni şifre en az 6 karakter olmalı'
    });
  }
  
  try {
  
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kullanıcı bulunamadı'
      });
    }
    
    const user = userResult.rows[0];
    
    
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      console.log('❌ Mevcut şifre yanlış:', user.username);
      return res.status(401).json({
        success: false,
        error: 'Mevcut şifre hatalı'
      });
    }
    
 
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    

    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, id]
    );
    
    console.log('✅ Şifre değiştirildi:', user.username);
    
    res.json({
      success: true,
      message: 'Şifre başarıyla değiştirildi'
    });
    
  } catch (error) {
    console.error('❌ Şifre değiştirilirken hata:', error);
    res.status(500).json({
      success: false,
      error: 'Şifre değiştirilemedi'
    });
  }
});


app.put('/api/users/:id/username', async (req, res) => {
  console.log('📝 Kullanıcı adı güncelleme istendi, ID:', req.params.id);
  
  const { id } = req.params;
  const { newUsername } = req.body;
  
  if (!newUsername || newUsername.trim().length < 3) {
    console.log('❌ Geçersiz kullanıcı adı');
    return res.status(400).json({
      success: false,
      error: 'Kullanıcı adı en az 3 karakter olmalı'
    });
  }
  
  try {
   
    const userCheck = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kullanıcı bulunamadı'
      });
    }
    
    const usernameCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [newUsername.trim(), id]
    );
    
    if (usernameCheck.rows.length > 0) {
      console.log('❌ Kullanıcı adı zaten alınmış:', newUsername);
      return res.status(409).json({
        success: false,
        error: 'Bu kullanıcı adı zaten kullanılıyor'
      });
    }
    
   
    const result = await pool.query(
      'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING username',
      [newUsername.trim(), id]
    );
    
    console.log('✅ Kullanıcı adı güncellendi:', result.rows[0].username);
    
    res.json({
      success: true,
      message: 'Kullanıcı adı başarıyla güncellendi',
      newUsername: result.rows[0].username
    });
    
  } catch (error) {
    console.error('❌ Kullanıcı adı güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      error: 'Kullanıcı adı güncellenemedi'
    });
  }
});

// =============================================
// AUTH ENDPOINTS
// =============================================


app.post('/api/register', async (req, res) => {
  console.log('📝 Kayıt isteği geldi:', req.body);
  
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    console.log('❌ Boş alanlar var');
    return res.status(400).json({
      success: false,
      error: 'Username, email ve password gerekli!'
    });
  }
  
  if (!email.includes('@')) {
    console.log('❌ Geçersiz email format');
    return res.status(400).json({
      success: false,
      error: 'Geçerli bir email adresi girin!'
    });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      console.log('❌ Email veya username zaten kayıtlı');
      return res.status(409).json({
        success: false,
        error: 'Bu email adresi veya kullanıcı adı zaten kayıtlı!'
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const result = await client.query(
      'INSERT INTO users (id, username, email, password) VALUES ($1, $2, $3, $4) RETURNING id, username, email, created_at',
      [userId, username.trim(), email.toLowerCase().trim(), hashedPassword]
    );
    
    await client.query('COMMIT');
    
    const newUser = result.rows[0];
    
    console.log('✅ Yeni kullanıcı PostgreSQL\'e kaydedildi:', {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      created_at: newUser.created_at
    });
    
    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        created_at: newUser.created_at
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Kayıt hatası:', error);
    
    if (error.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'Bu email adresi veya kullanıcı adı zaten kayıtlı!'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Sunucu hatası oluştu'
      });
    }
  } finally {
    client.release();
  }
});


app.post('/api/login', async (req, res) => {
  console.log('🔐 Giriş isteği geldi:', req.body);
  
  const { email, password } = req.body;
  
  if (!email || !password) {
    console.log('❌ Email veya password boş');
    return res.status(400).json({
      success: false,
      error: 'Email ve şifre gerekli!'
    });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı:', email);
      return res.status(401).json({
        success: false,
        error: 'Email veya şifre hatalı!'
      });
    }
    
    const user = result.rows[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Şifre yanlış:', email);
      return res.status(401).json({
        success: false,
        error: 'Email veya şifre hatalı!'
      });
    }
    
    console.log('✅ Başarılı giriş:', {
      id: user.id,
      username: user.username,
      email: user.email
    });
    
    res.json({
      success: true,
      message: 'Giriş başarılı!',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Giriş hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Sunucu hatası oluştu'
    });
  }
});

// =============================================
// PRODUCTS API ENDPOINTS
// =============================================


app.get('/api/products', async (req, res) => {
  console.log('📦 Ürün listesi istendi');
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.stock > 0 
      ORDER BY p.created_at DESC
    `);
    
    console.log(`✅ ${result.rows.length} ürün döndürüldü`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürünler alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ürünler alınamadı',
      details: error.message 
    });
  }
});


app.get('/api/products/:id', async (req, res) => {
  console.log('🔍 Tek ürün istendi, ID:', req.params.id);
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      console.log('❌ Ürün bulunamadı:', id);
      return res.status(404).json({ 
        success: false,
        error: 'Ürün bulunamadı' 
      });
    }
    
    console.log('✅ Ürün bulundu:', result.rows[0].name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Ürün alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ürün alınamadı',
      details: error.message 
    });
  }
});


app.get('/api/discounted-products', async (req, res) => {
  console.log('🔥 İndirimli ürünler istendi');
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.discount > 0 AND p.stock > 0 
      ORDER BY p.discount DESC, p.created_at DESC
      LIMIT 20
    `);
    
   
    if (result.rows.length === 0) {
      console.log('⚠️  Hiç indirimli ürün yok, rastgele ürünleri indirimli yapıyorum...');
      
    
      await pool.query(`
        UPDATE products 
        SET discount = CASE 
          WHEN random() < 0.3 THEN floor(random() * 30 + 10)::integer
          ELSE discount 
        END
        WHERE id IN (
          SELECT id FROM products 
          WHERE stock > 0 
          ORDER BY random() 
          LIMIT 8
        )
      `);
      
   
      const updatedResult = await pool.query(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.discount > 0 AND p.stock > 0 
        ORDER BY p.discount DESC, p.created_at DESC
        LIMIT 20
      `);
      
      console.log(`✅ ${updatedResult.rows.length} indirimli ürün oluşturuldu ve döndürüldü`);
      return res.json(updatedResult.rows);
    }
    
    console.log(`✅ ${result.rows.length} indirimli ürün döndürüldü`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ İndirimli ürünler alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'İndirimli ürünler alınamadı',
      details: error.message 
    });
  }
});

// Popüler ürünleri getir
app.get('/api/popular-products', async (req, res) => {
  console.log('⭐ Popüler ürünler istendi');
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name, pp.rank 
      FROM popular_products pp
      JOIN products p ON pp.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.stock > 0
      ORDER BY pp.rank ASC, p.created_at DESC
    `);
    
    console.log(`✅ ${result.rows.length} popüler ürün döndürüldü`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Popüler ürünler alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Popüler ürünler alınamadı',
      details: error.message 
    });
  }
});

// Yeni ürün ekle
app.post('/api/products', async (req, res) => {
  console.log('➕ Yeni ürün ekleme istendi:', req.body);
  try {
    const { name, price, description, image_url, category_id, stock } = req.body;
    
    if (!name || !price || !description) {
      console.log('❌ Gerekli alanlar eksik');
      return res.status(400).json({ 
        success: false,
        error: 'Ürün adı, fiyat ve açıklama gerekli' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO products (name, price, description, image_url, category_id, stock) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [name, price, description, image_url || null, category_id || 1, stock || 0]);
    
    console.log('✅ Yeni ürün eklendi:', result.rows[0].name);
    res.status(201).json({ 
      success: true,
      message: 'Ürün başarıyla eklendi',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Ürün eklenirken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ürün eklenemedi',
      details: error.message 
    });
  }
});

// =============================================
// CATEGORIES API ENDPOINTS
// =============================================

// Kategorileri getir - Sadece belirli ID'ler
app.get('/api/categories', async (req, res) => {
  console.log('📂 Kategori listesi istendi');
  try {
    
    const allowedIds = [ 2, 3, 4, 5, 6, 7, 8, 29];
    
    const result = await pool.query(`
      SELECT * FROM categories 
      WHERE id = ANY($1)
      ORDER BY 
        CASE 
       
          WHEN id = 2 THEN 2
          WHEN id = 3 THEN 3
          WHEN id = 4 THEN 4
          WHEN id = 5 THEN 5
          WHEN id = 6 THEN 6
          WHEN id = 7 THEN 7
          WHEN id = 8 THEN 8
          WHEN id = 29 THEN 9
        
          ELSE 11
        END
    `, [allowedIds]);
    
    console.log(`✅ ${result.rows.length} kategori döndürüldü (sadece ID: ${allowedIds.join(', ')})`);
    console.log('Döndürülen kategoriler:', result.rows.map(cat => `${cat.id}: ${cat.name}`));
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Kategoriler alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Kategoriler alınamadı',
      details: error.message 
    });
  }
});


app.get('/api/categories/all', async (req, res) => {
  console.log('📂 Tüm kategori listesi istendi');
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    console.log(`✅ ${result.rows.length} kategori döndürüldü (tümü)`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Tüm kategoriler alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Kategoriler alınamadı',
      details: error.message 
    });
  }
});


app.get('/api/categories/:slug/products', async (req, res) => {
  console.log('📂 Kategori ürünleri istendi, slug:', req.params.slug);
  try {
    const { slug } = req.params;
    const { sortBy = 'newest', priceMin = 0, priceMax = 99999 } = req.query;
    const allowedIds = [ 2, 3, 4, 5, 6, 7, 8, 11, 29];
    
   
    const categoryResult = await pool.query(
      'SELECT * FROM categories WHERE slug = $1 AND id = ANY($2)',
      [slug, allowedIds]
    );
    
    if (categoryResult.rows.length === 0) {
      console.log('❌ Kategori bulunamadı veya erişime kapalı:', slug);
      return res.status(404).json({
        success: false,
        error: 'Kategori bulunamadı'
      });
    }
    
    const category = categoryResult.rows[0];
    console.log('✅ Kategori bulundu:', category.name, 'ID:', category.id);
    

    let orderClause = 'ORDER BY p.created_at DESC';
    switch (sortBy) {
      case 'price-low':
        orderClause = 'ORDER BY p.price ASC';
        break;
      case 'price-high':
        orderClause = 'ORDER BY p.price DESC';
        break;
      case 'popular':
        orderClause = 'ORDER BY p.stock DESC, p.created_at DESC';
        break;
      case 'rating':
        orderClause = 'ORDER BY p.created_at DESC';
        break;
      default:
        orderClause = 'ORDER BY p.created_at DESC';
    }
    

    const productsResult = await pool.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.category_id = $1 
        AND p.stock > 0 
        AND p.price BETWEEN $2 AND $3
      ${orderClause}
    `, [category.id, priceMin, priceMax]);
    
    console.log(`✅ ${productsResult.rows.length} ürün bulundu (Kategori: ${category.name})`);
    
    res.json({
      success: true,
      data: {
        category: category,
        products: productsResult.rows,
        totalProducts: productsResult.rows.length,
        filters: {
          sortBy,
          priceRange: [priceMin, priceMax]
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Kategori ürünleri getirilirken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Kategori ürünleri getirilemedi',
      details: error.message 
    });
  }
});


app.get('/api/categories/:id', async (req, res) => {
  console.log('🔍 Kategori detayı istendi, ID:', req.params.id);
  try {
    const { id } = req.params;
    const allowedIds = [ 2, 3, 4, 5, 6, 7, 8, 11, 29];
    
   
    if (isNaN(parseInt(id))) {
      console.log('❌ Geçersiz ID formatı:', id);
      return res.status(404).json({
        success: false,
        error: 'Geçersiz kategori ID\'si'
      });
    }
    
   
    if (!allowedIds.includes(parseInt(id))) {
      console.log('❌ Bu kategori ID\'si erişime kapalı:', id);
      return res.status(403).json({
        success: false,
        error: 'Bu kategoriye erişim yetkiniz yok'
      });
    }
    
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      console.log('❌ Kategori bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kategori bulunamadı'
      });
    }
    
    console.log('✅ Kategori bulundu:', result.rows[0].name);
    res.json({
      success: true,
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Kategori detayı alınırken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Kategori detayı alınamadı',
      details: error.message 
    });
  }
});


app.get('/api/categories/:id/products', async (req, res) => {
  console.log('📦 Kategori ürünleri istendi (ID), ID:', req.params.id);
  try {
    const { id } = req.params;
    const { sortBy = 'newest', priceMin = 0, priceMax = 99999 } = req.query;
    const allowedIds = [ 2, 3, 4, 5, 6, 7, 8, 11, 29];
    

    if (isNaN(parseInt(id))) {
      console.log('❌ Geçersiz ID formatı:', id);
      return res.status(404).json({
        success: false,
        error: 'Geçersiz kategori ID\'si'
      });
    }
    

    if (!allowedIds.includes(parseInt(id))) {
      console.log('❌ Bu kategori ID\'si erişime kapalı:', id);
      return res.status(403).json({
        success: false,
        error: 'Bu kategoriye erişim yetkiniz yok'
      });
    }
    
 
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    
    if (categoryResult.rows.length === 0) {
      console.log('❌ Kategori bulunamadı:', id);
      return res.status(404).json({
        success: false,
        error: 'Kategori bulunamadı'
      });
    }
    
    const category = categoryResult.rows[0];
    console.log('✅ Kategori bulundu:', category.name);
    
    // Sıralama SQL'i oluştur
    let orderClause = 'ORDER BY p.created_at DESC';
    switch (sortBy) {
      case 'price-low':
        orderClause = 'ORDER BY p.price ASC';
        break;
      case 'price-high':
        orderClause = 'ORDER BY p.price DESC';
        break;
      case 'popular':
        orderClause = 'ORDER BY p.stock DESC, p.created_at DESC';
        break;
      case 'rating':
        orderClause = 'ORDER BY p.created_at DESC';
        break;
      default:
        orderClause = 'ORDER BY p.created_at DESC';
    }
    
 
    const result = await pool.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.category_id = $1 
        AND p.stock > 0 
        AND p.price BETWEEN $2 AND $3
      ${orderClause}
    `, [id, priceMin, priceMax]);
    
    console.log(`✅ ${result.rows.length} ürün bulundu (ID ile)`);
    
    
    res.json({
      success: true,
      data: {
        category: category,
        products: result.rows,
        totalProducts: result.rows.length,
        filters: {
          sortBy,
          priceRange: [priceMin, priceMax]
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Kategori ürünleri getirilirken hata:', error);
    res.status(500).json({ 
      success: false,
      error: 'Kategori ürünleri getirilemedi',
      details: error.message 
    });
  }
});

// =============================================
// USERS API ENDPOINTS
// =============================================


app.get('/api/users', async (req, res) => {
  try {
    console.log('📋 Kullanıcı listesi istendi');
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('❌ Kullanıcı listesi hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Veritabanı hatası' 
    });
  }
});

// =============================================
// UTILITY ENDPOINTS
// =============================================


app.get('/api/test', async (req, res) => {
  try {
    const userResult = await pool.query('SELECT COUNT(*) as total FROM users');
    const productResult = await pool.query('SELECT COUNT(*) as total FROM products');
    const popularResult = await pool.query('SELECT COUNT(*) as total FROM popular_products');
    console.log('✅ Test endpoint çalışıyor');
    res.json({
      message: 'Server çalışıyor!',
      timestamp: new Date().toISOString(),
      port: 5001,
      totalUsers: parseInt(userResult.rows[0].total),
      totalProducts: parseInt(productResult.rows[0].total),
      totalPopularProducts: parseInt(popularResult.rows[0].total),
      database: 'PostgreSQL'
    });
  } catch (error) {
    console.error('❌ Test endpoint hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Veritabanı bağlantı hatası' 
    });
  }
});


app.get('/api/db-status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    res.json({
      success: true,
      connected: true,
      server_time: result.rows[0].current_time,
      postgresql_version: result.rows[0].version,
      pool_info: {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        waiting_connections: pool.waitingCount
      }
    });
  } catch (error) {
    console.error('❌ Veritabanı durum kontrolü hatası:', error);
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server çalışıyor' });
});

// Ana sayfa
app.get('/', (req, res) => {
  res.json({ 
    message: 'ShopMind API Server',
    endpoints: {
      products: '/api/products',
      categories: '/api/categories',
      discounted: '/api/discounted-products',
      popular: '/api/popular-products',
      comments: '/api/comments',
      health: '/api/health',
      users: '/api/users',
      register: 'POST /api/register',
      login: 'POST /api/login'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❌ 404 - Route bulunamadı:', req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'Endpoint bulunamadı',
    requestedPath: req.originalUrl
  });
});


app.use((error, req, res, next) => {
  console.error('💥 Server hatası:', error);
  res.status(500).json({
    success: false,
    error: 'Sunucu hatası'
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Server kapatılıyor...');
  await pool.end();
  console.log('✅ PostgreSQL bağlantıları kapatıldı');
  process.exit(0);
});

const PORT = 5001;

async function startServer() {
  try {
    await initDatabase();

    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log('🚀 Server başlatıldı!');
      console.log(`📍 Port: ${PORT}`);
      console.log(`🔗 Test: http://localhost:${PORT}/api/test`);
      console.log(`👥 Kullanıcılar: http://localhost:${PORT}/api/users`);
      console.log(`📦 Ürünler: http://localhost:${PORT}/api/products`);
      console.log(`🔥 İndirimli: http://localhost:${PORT}/api/discounted-products`);
      console.log(`⭐ Popüler: http://localhost:${PORT}/api/popular-products`);
      console.log(`📂 Kategoriler: http://localhost:${PORT}/api/categories`);
      console.log(`💬 Yorumlar: http://localhost:${PORT}/api/comments`);
      console.log(`🗄️  DB Durum: http://localhost:${PORT}/api/db-status`);
      console.log('✅ Hazır, istekleri bekliyor...');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`❌ Port ${PORT} kullanımda, ${PORT + 1} portunu deniyorum...`);
        setTimeout(() => {
          server.close();
          app.listen(PORT + 1, '127.0.0.1', () => {
            console.log(`🚀 Server ${PORT + 1} portunda başlatıldı!`);
          });
        }, 1000);
      } else {
        console.error('❌ Server başlatılamadı:', err);
      }
    });

  } catch (error) {
    console.error('❌ Server başlatılırken hata:', error);
    process.exit(1);
  }
}

startServer();