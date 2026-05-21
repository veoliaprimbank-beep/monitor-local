const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === DATABASE ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Create table on startup
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pins (
        id SERIAL PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        type TEXT NOT NULL,
        sev TEXT NOT NULL,
        comment TEXT,
        name TEXT,
        ts BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

// === API ROUTES ===

// Get all pins
app.get('/api/pins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pins ORDER BY ts DESC LIMIT 1000');
    res.json(result.rows);
  } catch (err) {
    console.error('GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new pin
app.post('/api/pins', async (req, res) => {
  try {
    const { lat, lng, type, sev, comment, name, ts } = req.body;

    // Validation
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat/lng required' });
    }
    if (!type || !sev) {
      return res.status(400).json({ error: 'type and sev required' });
    }
    // Moldova bounds check
    if (lat < 45 || lat > 49 || lng < 26 || lng > 31) {
      return res.status(400).json({ error: 'Coordinates outside Moldova' });
    }

    const result = await pool.query(
      `INSERT INTO pins (lat, lng, type, sev, comment, name, ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [lat, lng, type, sev, (comment || '').slice(0, 500), (name || 'Аноним').slice(0, 50), ts || Date.now()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM pins');
    const byType = await pool.query('SELECT type, COUNT(*) FROM pins GROUP BY type');
    res.json({ total: parseInt(total.rows[0].count), byType: byType.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚗 Moldova Roads server running on port ${PORT}`);
  await initDB();
});
