// routes/comments.js - Gelişmiş yorum sistemi ve ürün bazında analiz
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL bağlantı ayarları
const pool = new Pool({
  user: 'postgres',          
  host: 'localhost',         
  database: 'shopmind_db',   
  password: 'bet2516', 
  port: 5432,               
});

// Comments tablosunu oluştur (gelişmiş versiyon)
async function initCommentsTable() {
  try {
    const client = await pool.connect();
    
    // Mevcut tabloyu kontrol et ve eksik sütunları ekle
    await client.query(`
      DO $$ 
      BEGIN
        -- Tablo yoksa oluştur
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          username VARCHAR(100) NOT NULL,
          comment TEXT NOT NULL,
          is_approved BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Sentiment sütunları yoksa ekle
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='sentiment_score') THEN
          ALTER TABLE comments ADD COLUMN sentiment_score INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='sentiment_label') THEN
          ALTER TABLE comments ADD COLUMN sentiment_label VARCHAR(20) DEFAULT 'neutral';
        END IF;
      END $$;
    `);
    
    console.log('✅ Comments tablosu hazır');
    client.release();
  } catch (error) {
    console.error('❌ Comments tablosu oluşturulamadı:', error);
  }
}

initCommentsTable();

// Gelişmiş yorum analizi fonksiyonu
function analyzeCommentAdvanced(comment) {
  const lowerComment = comment.toLowerCase();
  
  // Pozitif kelimeler ve puanları
  const positiveWords = {
    'harika': 3, 'mükemmel': 3, 'süper': 2, 'güzel': 2, 'iyi': 1,
    'beğendim': 2, 'tavsiye': 2, 'kaliteli': 2, 'hızlı': 1, 'ucuz': 1,
    'başarılı': 2, 'praktik': 1, 'kullanışlı': 2, 'dayanıklı': 2,
    'şık': 1, 'elegant': 2, 'modern': 1, 'sağlam': 2, 'memnun': 2,
    'sevdim': 2, 'öneririm': 2, 'efsane': 3, 'müthiş': 3, 'fiyat': 1
  };
  
  // Negatif kelimeler ve puanları
  const negativeWords = {
    'kötü': -2, 'berbat': -3, 'rezalet': -3, 'çöp': -3, 'saçma': -2,
    'boktan': -3, 'aptal': -2, 'gereksiz': -2, 'işe yaramaz': -3,
    'paranın boşa': -3, 'pişman': -2, 'sorunlu': -2, 'bozuk': -2,
    'yavaş': -1, 'pahalı': -1, 'küçük': -1, 'büyük': -1, 'beğenmedim': -2
  };
  
  // Spam kontrol kelimeleri
  const spamWords = [
    'link', 'tıkla', 'bedava', 'para kazan', 'siteyi ziyaret',
    'reklam', 'promosyon', 'http', 'www.'
  ];
  
  // Spam kontrolü
  const hasSpam = spamWords.some(word => lowerComment.includes(word));
  if (hasSpam) {
    return { isApproved: false, sentimentScore: 0, sentimentLabel: 'spam' };
  }
  
  // Sentiment analizi
  let sentimentScore = 0;
  
  // Pozitif kelimeleri say
  Object.keys(positiveWords).forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = (lowerComment.match(regex) || []).length;
    sentimentScore += matches * positiveWords[word];
  });
  
  // Negatif kelimeleri say
  Object.keys(negativeWords).forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = (lowerComment.match(regex) || []).length;
    sentimentScore += matches * negativeWords[word];
  });
  
  // Ünlem işareti pozitif etki
  const exclamationCount = (comment.match(/!/g) || []).length;
  sentimentScore += Math.min(exclamationCount, 2);
  
  // Büyük harf kullanımı kontrolü
  const upperCaseRatio = (comment.match(/[A-ZÇĞIİÖŞÜ]/g) || []).length / comment.length;
  if (upperCaseRatio > 0.5) sentimentScore -= 1;
  
  // Sentiment etiketi belirle
  let sentimentLabel;
  if (sentimentScore >= 3) sentimentLabel = 'very_positive';
  else if (sentimentScore >= 1) sentimentLabel = 'positive';
  else if (sentimentScore <= -3) sentimentLabel = 'very_negative';
  else if (sentimentScore <= -1) sentimentLabel = 'negative';
  else sentimentLabel = 'neutral';
  
  // Onay durumu
  const isApproved = sentimentScore > -4;
  
  return {
    isApproved,
    sentimentScore,
    sentimentLabel
  };
}

// Ürün özelliklerini analiz et - Yeni Fonksiyon
function analyzeProductFeatures(comments) {
  // Ürün özellikleri kategorileri
  const featureCategories = {
    'kalite': {
      keywords: ['kalite', 'kaliteli', 'sağlam', 'dayanıklı', 'güçlü', 'iyi', 'güzel'],
      label: 'Kalite'
    },
    'fiyat': {
      keywords: ['fiyat', 'ucuz', 'pahalı', 'uygun', 'ekonomik', 'değer', 'para'],
      label: 'Fiyat'
    },
    'tasarim': {
      keywords: ['tasarım', 'görünüm', 'şık', 'elegant', 'modern', 'güzel', 'hoş'],
      label: 'Tasarım'
    },
    'hiz': {
      keywords: ['hız', 'hızlı', 'yavaş', 'çabuk', 'sürat', 'performans'],
      label: 'Hız/Performans'
    },
    'kullanim': {
      keywords: ['kullanım', 'kullanışlı', 'pratik', 'kolay', 'zor', 'rahat'],
      label: 'Kullanım Kolaylığı'
    },
    'boyut': {
      keywords: ['boyut', 'büyük', 'küçük', 'ebat', 'ölçü', 'hacim'],
      label: 'Boyut'
    },
    'garanti': {
      keywords: ['garanti', 'servis', 'destek', 'yardım', 'çöz'],
      label: 'Garanti/Servis'
    },
    'kargo': {
      keywords: ['kargo', 'teslimat', 'gönderi', 'paket', 'ulaş'],
      label: 'Kargo/Teslimat'
    }
  };

  const positiveFeatures = {};
  const negativeFeatures = {};

  // Her kategori için analiz yap
  Object.keys(featureCategories).forEach(categoryKey => {
    const category = featureCategories[categoryKey];
    positiveFeatures[categoryKey] = { 
      label: category.label, 
      count: 0, 
      comments: [],
      keywords: []
    };
    negativeFeatures[categoryKey] = { 
      label: category.label, 
      count: 0, 
      comments: [],
      keywords: []
    };
  });

  comments.forEach(comment => {
    const lowerComment = comment.comment.toLowerCase();
    const isPositive = comment.sentiment_score > 0;
    const isNegative = comment.sentiment_score < 0;

    Object.keys(featureCategories).forEach(categoryKey => {
      const category = featureCategories[categoryKey];
      
      // Bu kategorideki kelimeleri ara
      const foundKeywords = category.keywords.filter(keyword => 
        new RegExp(`\\b${keyword}\\b`, 'gi').test(lowerComment)
      );

      if (foundKeywords.length > 0) {
        if (isPositive) {
          positiveFeatures[categoryKey].count++;
          positiveFeatures[categoryKey].comments.push({
            id: comment.id,
            username: comment.username,
            comment: comment.comment,
            sentiment_score: comment.sentiment_score,
            created_at: comment.created_at
          });
          positiveFeatures[categoryKey].keywords.push(...foundKeywords);
        } else if (isNegative) {
          negativeFeatures[categoryKey].count++;
          negativeFeatures[categoryKey].comments.push({
            id: comment.id,
            username: comment.username,
            comment: comment.comment,
            sentiment_score: comment.sentiment_score,
            created_at: comment.created_at
          });
          negativeFeatures[categoryKey].keywords.push(...foundKeywords);
        }
      }
    });
  });

  // En çok bahsedilen pozitif ve negatif özellikleri sırala
  const topPositiveFeatures = Object.entries(positiveFeatures)
    .filter(([_, data]) => data.count > 0)
    .sort(([_, a], [__, b]) => b.count - a.count)
    .slice(0, 5)
    .map(([key, data]) => ({
      category: key,
      label: data.label,
      count: data.count,
      comments: data.comments.slice(0, 3), // İlk 3 yorumu al
      uniqueKeywords: [...new Set(data.keywords)]
    }));

  const topNegativeFeatures = Object.entries(negativeFeatures)
    .filter(([_, data]) => data.count > 0)
    .sort(([_, a], [__, b]) => b.count - a.count)
    .slice(0, 5)
    .map(([key, data]) => ({
      category: key,
      label: data.label,
      count: data.count,
      comments: data.comments.slice(0, 3), // İlk 3 yorumu al
      uniqueKeywords: [...new Set(data.keywords)]
    }));

  return {
    positiveFeatures: topPositiveFeatures,
    negativeFeatures: topNegativeFeatures
  };
}

// Mevcut yorumları analiz et ve güncelle
async function reanalyzeExistingComments() {
  try {
    const client = await pool.connect();
    
    // Henüz analiz edilmemiş yorumları getir
    const result = await client.query(`
      SELECT id, comment 
      FROM comments 
      WHERE sentiment_score = 0 AND sentiment_label = 'neutral'
      OR sentiment_score IS NULL OR sentiment_label IS NULL
    `);
    
    let updatedCount = 0;
    
    for (const row of result.rows) {
      const analysis = analyzeCommentAdvanced(row.comment);
      
      await client.query(`
        UPDATE comments 
        SET sentiment_score = $1, sentiment_label = $2, is_approved = $3
        WHERE id = $4
      `, [analysis.sentimentScore, analysis.sentimentLabel, analysis.isApproved, row.id]);
      
      updatedCount++;
    }
    
    console.log(`✅ ${updatedCount} yorum yeniden analiz edildi`);
    client.release();
    
    return updatedCount;
  } catch (error) {
    console.error('❌ Mevcut yorumlar analiz edilemedi:', error);
    return 0;
  }
}

// ===== TEMEL YORUM ENDPOİNTLERİ =====

// Ürün yorumlarını getir
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT id, username, comment, created_at, is_approved, sentiment_score, sentiment_label 
      FROM comments 
      WHERE product_id = $1 AND is_approved = TRUE 
      ORDER BY created_at DESC
    `, [productId]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Yorumlar alınamadı:', error);
    res.status(500).json({ error: 'Yorumlar alınamadı' });
  }
});

// Yeni yorum ekle
router.post('/', async (req, res) => {
  try {
    const { product_id, user_id, username, comment } = req.body;
    
    if (!product_id || !user_id || !username || !comment) {
      return res.status(400).json({ error: 'Tüm alanlar gerekli' });
    }
    
    if (comment.trim().length < 8) {
      return res.status(400).json({ error: 'Yorum en az 8 karakter olmalı' });
    }
    
    // Gelişmiş AI analizi
    const analysis = analyzeCommentAdvanced(comment);
    
    const result = await pool.query(`
      INSERT INTO comments (product_id, user_id, username, comment, is_approved, sentiment_score, sentiment_label)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [product_id, user_id, username, comment.trim(), analysis.isApproved, analysis.sentimentScore, analysis.sentimentLabel]);
    
    console.log(`✅ Yeni yorum eklendi: ${username} - ${analysis.sentimentLabel} (${analysis.sentimentScore})`);
    
    res.json({ 
      success: true, 
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
      sentiment: analysis.sentimentLabel,
      message: analysis.isApproved ? 'Yorum eklendi' : 'Yorum incelemeye alındı'
    });
    
  } catch (error) {
    console.error('❌ Yorum eklenemedi:', error);
    res.status(500).json({ error: 'Yorum eklenemedi' });
  }
});

// Yorum sil
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM comments WHERE id = $1 RETURNING *', 
      [commentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Yorum bulunamadı' });
    }
    
    console.log('✅ Yorum silindi:', commentId);
    res.json({ success: true, message: 'Yorum silindi' });
    
  } catch (error) {
    console.error('❌ Yorum silinemedi:', error);
    res.status(500).json({ error: 'Yorum silinemedi' });
  }
});

// Yorum onay durumunu değiştir
router.put('/:commentId/approve', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { is_approved } = req.body;
    
    const result = await pool.query(
      'UPDATE comments SET is_approved = $1 WHERE id = $2 RETURNING *', 
      [is_approved, commentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Yorum bulunamadı' });
    }
    
    console.log(`✅ Yorum ${is_approved ? 'onaylandı' : 'reddedildi'}:`, commentId);
    res.json({ 
      success: true, 
      message: is_approved ? 'Yorum onaylandı' : 'Yorum reddedildi' 
    });
    
  } catch (error) {
    console.error('❌ Yorum güncellenemedi:', error);
    res.status(500).json({ error: 'Yorum güncellenemedi' });
  }
});

// Tüm yorumları getir (admin için)
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.name as product_name 
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      ORDER BY c.created_at DESC
    `);
    
    console.log(`✅ ${result.rows.length} toplam yorum döndürüldü`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Tüm yorumlar alınamadı:', error);
    res.status(500).json({ error: 'Yorumlar alınamadı' });
  }
});

// ===== GENEL ANALİZ ENDPOİNTLERİ =====

// Genel yorum istatistikleri (tüm ürünler)
router.get('/analytics/overview', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_comments,
        COUNT(CASE WHEN is_approved = true THEN 1 END) as approved_comments,
        COUNT(CASE WHEN sentiment_label = 'very_positive' THEN 1 END) as very_positive,
        COUNT(CASE WHEN sentiment_label = 'positive' THEN 1 END) as positive,
        COUNT(CASE WHEN sentiment_label = 'neutral' THEN 1 END) as neutral,
        COUNT(CASE WHEN sentiment_label = 'negative' THEN 1 END) as negative,
        COUNT(CASE WHEN sentiment_label = 'very_negative' THEN 1 END) as very_negative,
        COALESCE(ROUND(CAST(AVG(sentiment_score) AS NUMERIC), 2), 0) as avg_sentiment_score
      FROM comments
      WHERE is_approved = true
    `);
    
    console.log('✅ Genel analiz verileri gönderildi');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Genel analiz verileri alınamadı:', error);
    res.status(500).json({ error: 'Analiz verileri alınamadı' });
  }
});

// En pozitif yorumlar (tüm ürünler)
router.get('/analytics/most-positive', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.name as product_name
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.is_approved = true AND c.sentiment_score >= 1
      ORDER BY c.sentiment_score DESC, c.created_at DESC
      LIMIT 10
    `);
    
    console.log(`✅ ${result.rows.length} genel pozitif yorum gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Genel pozitif yorumlar alınamadı:', error);
    res.status(500).json({ error: 'Pozitif yorumlar alınamadı' });
  }
});

// En negatif yorumlar (tüm ürünler)
router.get('/analytics/most-negative', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.name as product_name
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.is_approved = true AND c.sentiment_score <= -1
      ORDER BY c.sentiment_score ASC, c.created_at DESC
      LIMIT 10
    `);
    
    console.log(`✅ ${result.rows.length} genel negatif yorum gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Genel negatif yorumlar alınamadı:', error);
    res.status(500).json({ error: 'Negatif yorumlar alınamadı' });
  }
});

// Ürün bazında analiz (tüm ürünler)
router.get('/analytics/by-product', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        COUNT(c.id) as comment_count,
        COALESCE(ROUND(CAST(AVG(c.sentiment_score) AS NUMERIC), 2), 0) as avg_sentiment,
        COUNT(CASE WHEN c.sentiment_label IN ('positive', 'very_positive') THEN 1 END) as positive_count,
        COUNT(CASE WHEN c.sentiment_label IN ('negative', 'very_negative') THEN 1 END) as negative_count
      FROM products p
      LEFT JOIN comments c ON p.id = c.product_id AND c.is_approved = true
      WHERE EXISTS (SELECT 1 FROM comments WHERE product_id = p.id AND is_approved = true)
      GROUP BY p.id, p.name
      ORDER BY comment_count DESC, avg_sentiment DESC
    `);
    
    console.log(`✅ ${result.rows.length} ürün analizi gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürün analizi alınamadı:', error);
    res.status(500).json({ error: 'Ürün analizi alınamadı' });
  }
});

// Zaman bazında trend analizi (tüm ürünler)
router.get('/analytics/trends', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as comment_count,
        COALESCE(ROUND(CAST(AVG(sentiment_score) AS NUMERIC), 2), 0) as avg_sentiment,
        COUNT(CASE WHEN sentiment_label IN ('positive', 'very_positive') THEN 1 END) as positive_count,
        COUNT(CASE WHEN sentiment_label IN ('negative', 'very_negative') THEN 1 END) as negative_count
      FROM comments
      WHERE is_approved = true AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    console.log(`✅ ${result.rows.length} günlük genel trend verisi gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Genel trend analizi alınamadı:', error);
    res.status(500).json({ error: 'Trend analizi alınamadı' });
  }
});

// Mevcut tüm yorumları yeniden analiz et
router.post('/analytics/reanalyze', async (req, res) => {
  try {
    const updatedCount = await reanalyzeExistingComments();
    res.json({ 
      success: true, 
      message: `${updatedCount} yorum yeniden analiz edildi`,
      updatedCount 
    });
  } catch (error) {
    console.error('❌ Genel yeniden analiz başarısız:', error);
    res.status(500).json({ error: 'Yeniden analiz başarısız' });
  }
});

// ===== ÜRÜN BAZINDA ANALİZ ENDPOİNTLERİ =====

// Belirli ürünün genel yorum istatistikleri
router.get('/analytics/overview/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_comments,
        COUNT(CASE WHEN is_approved = true THEN 1 END) as approved_comments,
        COUNT(CASE WHEN sentiment_label = 'very_positive' THEN 1 END) as very_positive,
        COUNT(CASE WHEN sentiment_label = 'positive' THEN 1 END) as positive,
        COUNT(CASE WHEN sentiment_label = 'neutral' THEN 1 END) as neutral,
        COUNT(CASE WHEN sentiment_label = 'negative' THEN 1 END) as negative,
        COUNT(CASE WHEN sentiment_label = 'very_negative' THEN 1 END) as very_negative,
        COALESCE(ROUND(CAST(AVG(sentiment_score) AS NUMERIC), 2), 0) as avg_sentiment_score,
        (SELECT name FROM products WHERE id = $1) as product_name
      FROM comments
      WHERE product_id = $1 AND is_approved = true
    `, [productId]);
    
    console.log(`✅ Ürün ${productId} analiz genel bakış verileri gönderildi`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Ürün analiz verileri alınamadı:', error);
    res.status(500).json({ error: 'Ürün analiz verileri alınamadı' });
  }
});

// Belirli ürünün en pozitif yorumları
router.get('/analytics/most-positive/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT c.*, p.name as product_name
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.product_id = $1 AND c.is_approved = true AND c.sentiment_score >= 1
      ORDER BY c.sentiment_score DESC, c.created_at DESC
      LIMIT 10
    `, [productId]);
    
    console.log(`✅ Ürün ${productId} için ${result.rows.length} pozitif yorum gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürün pozitif yorumları alınamadı:', error);
    res.status(500).json({ error: 'Ürün pozitif yorumları alınamadı' });
  }
});

// Belirli ürünün en negatif yorumları
router.get('/analytics/most-negative/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT c.*, p.name as product_name
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.product_id = $1 AND c.is_approved = true AND c.sentiment_score <= -1
      ORDER BY c.sentiment_score ASC, c.created_at DESC
      LIMIT 10
    `, [productId]);
    
    console.log(`✅ Ürün ${productId} için ${result.rows.length} negatif yorum gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürün negatif yorumları alınamadı:', error);
    res.status(500).json({ error: 'Ürün negatif yorumları alınamadı' });
  }
});

// Belirli ürünün zaman bazında trend analizi
router.get('/analytics/trends/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as comment_count,
        COALESCE(ROUND(CAST(AVG(sentiment_score) AS NUMERIC), 2), 0) as avg_sentiment,
        COUNT(CASE WHEN sentiment_label IN ('positive', 'very_positive') THEN 1 END) as positive_count,
        COUNT(CASE WHEN sentiment_label IN ('negative', 'very_negative') THEN 1 END) as negative_count
      FROM comments
      WHERE product_id = $1 AND is_approved = true AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [productId]);
    
    console.log(`✅ Ürün ${productId} için ${result.rows.length} günlük trend verisi gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürün trend analizi alınamadı:', error);
    res.status(500).json({ error: 'Ürün trend analizi alınamadı' });
  }
});

// Belirli ürünün yorum dağılımı (sentiment oranları)
router.get('/analytics/sentiment-distribution/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        sentiment_label,
        COUNT(*) as count,
        ROUND(CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM comments WHERE product_id = $1 AND is_approved = true) AS NUMERIC), 1) as percentage
      FROM comments
      WHERE product_id = $1 AND is_approved = true
      GROUP BY sentiment_label
      ORDER BY count DESC
    `, [productId]);
    
    console.log(`✅ Ürün ${productId} sentiment dağılımı gönderildi`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ürün sentiment dağılımı alınamadı:', error);
    res.status(500).json({ error: 'Ürün sentiment dağılımı alınamadı' });
  }
});

// Belirli ürünün kelime bulutu için analiz
router.get('/analytics/word-cloud/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT comment, sentiment_label, sentiment_score
      FROM comments
      WHERE product_id = $1 AND is_approved = true
      ORDER BY created_at DESC
    `, [productId]);
    
    // Basit kelime analizi
    const wordFrequency = {};
    const positiveWords = [];
    const negativeWords = [];
    
    result.rows.forEach(row => {
      const words = row.comment.toLowerCase()
        .replace(/[^\w\sçğıöşüÇĞIİÖŞÜ]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2);
      
      words.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        
        if (row.sentiment_score > 0) {
          positiveWords.push(word);
        } else if (row.sentiment_score < 0) {
          negativeWords.push(word);
        }
      });
    });
    
    // En sık kullanılan kelimeleri al
    const sortedWords = Object.entries(wordFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 50)
      .map(([word, count]) => ({ word, count }));
    
    console.log(`✅ Ürün ${productId} kelime analizi gönderildi`);
    res.json({
      wordFrequency: sortedWords,
      totalComments: result.rows.length,
      positiveWordCount: positiveWords.length,
      negativeWordCount: negativeWords.length
    });
  } catch (error) {
    console.error('❌ Ürün kelime analizi alınamadı:', error);
    res.status(500).json({ error: 'Ürün kelime analizi alınamadı' });
  }
});

// YENİ ENDPOİNT: Belirli ürünün beğenilen ve eleştirilen yönleri
router.get('/analytics/product-features/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await pool.query(`
      SELECT id, username, comment, sentiment_score, sentiment_label, created_at
      FROM comments
      WHERE product_id = $1 AND is_approved = true
      ORDER BY created_at DESC
    `, [productId]);
    
    // Ürün özelliklerini analiz et
    const featuresAnalysis = analyzeProductFeatures(result.rows);
    
    console.log(`✅ Ürün ${productId} özellik analizi gönderildi`);
    res.json({
      productId: parseInt(productId),
      totalComments: result.rows.length,
      positiveFeatures: featuresAnalysis.positiveFeatures,
      negativeFeatures: featuresAnalysis.negativeFeatures,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Ürün özellik analizi alınamadı:', error);
    res.status(500).json({ error: 'Ürün özellik analizi alınamadı' });
  }
});

// YENİ ENDPOİNT: Genel ürün özellikleri analizi (tüm ürünler)
router.get('/analytics/all-products-features', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.username, c.comment, c.sentiment_score, c.sentiment_label, c.created_at,
             p.name as product_name, p.id as product_id
      FROM comments c
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.is_approved = true
      ORDER BY c.created_at DESC
    `);
    
    // Tüm yorumları analiz et
    const featuresAnalysis = analyzeProductFeatures(result.rows);
    
    console.log(`✅ Genel özellik analizi gönderildi`);
    res.json({
      totalComments: result.rows.length,
      positiveFeatures: featuresAnalysis.positiveFeatures,
      negativeFeatures: featuresAnalysis.negativeFeatures,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Genel özellik analizi alınamadı:', error);
    res.status(500).json({ error: 'Genel özellik analizi alınamadı' });
  }
});

// Belirli ürünün mevcut yorumlarını yeniden analiz et
router.post('/analytics/reanalyze/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const client = await pool.connect();
    
    // Belirli ürünün henüz analiz edilmemiş yorumlarını getir
    const result = await client.query(`
      SELECT id, comment 
      FROM comments 
      WHERE product_id = $1 AND (
        (sentiment_score = 0 AND sentiment_label = 'neutral')
        OR sentiment_score IS NULL 
        OR sentiment_label IS NULL
      )
    `, [productId]);
    
    let updatedCount = 0;
    
    for (const row of result.rows) {
      const analysis = analyzeCommentAdvanced(row.comment);
      
      await client.query(`
        UPDATE comments 
        SET sentiment_score = $1, sentiment_label = $2, is_approved = $3
        WHERE id = $4
      `, [analysis.sentimentScore, analysis.sentimentLabel, analysis.isApproved, row.id]);
      
      updatedCount++;
    }
    
    console.log(`✅ Ürün ${productId} için ${updatedCount} yorum yeniden analiz edildi`);
    client.release();
    
    res.json({ 
      success: true, 
      message: `Ürün ${productId} için ${updatedCount} yorum yeniden analiz edildi`,
      updatedCount,
      productId 
    });
  } catch (error) {
    console.error('❌ Ürün yeniden analizi başarısız:', error);
    res.status(500).json({ error: 'Ürün yeniden analizi başarısız' });
  }
});

module.exports = router;