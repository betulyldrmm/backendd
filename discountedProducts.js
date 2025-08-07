
const express = require('express');
const router = express.Router();
const pool = require('../db'); 

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE discount > 0');
    res.json(result.rows);
  } catch (error) {
    console.error('İndirimli ürünler alınırken hata:', error);
    res.status(500).json({ error: 'İndirimli ürünler yüklenemedi' });
  }
});

module.exports = router;
