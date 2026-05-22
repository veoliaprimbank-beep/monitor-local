const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database ─────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

// ─── Init DB ──────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id         BIGINT PRIMARY KEY,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      type       TEXT NOT NULL,
      description TEXT,
      severity   INTEGER DEFAULT 2,
      status     TEXT DEFAULT 'new',
      name       TEXT DEFAULT 'Anonim',
      email      TEXT,
      addr       TEXT,
      photo      TEXT,
      report_date TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed sample data if table is empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM reports');
  if (parseInt(rows[0].count) === 0) {
    const seed = [
      [1747000001, 47.0245, 28.8324, 'Groapă / Яма', 'Groapă mare în centru / Большая яма в центре', 4, 'new', 'Maria Ion', '', 'bd. Ștefan cel Mare, Chișinău', '2026-05-10'],
      [1747000002, 47.0612, 28.8553, 'Carosabil deteriorat / Разбитая дорога', 'Asfalt crăpat / Треснувший асфальт pe toată strada', 3, 'progress', 'Alexandru M.', '', 'str. Albișoara, Chișinău', '2026-05-08'],
      [1747000003, 46.9834, 28.8201, 'Iluminat defect / Освещение сломано', '5 stâlpi nu funcționează / 5 фонарей не работают', 2, 'fixed', 'Anonim', '', 'str. Munceșilor, Chișinău', '2026-04-25'],
      [1747000004, 47.7567, 27.9285, 'Groapă / Яма', 'Hrib mare pe drumul național / Большая яма на трассе', 4, 'new', 'Vasile P.', '', 'DN2, Bălți', '2026-05-12'],
      [1747000005, 46.3411, 28.6547, 'Semn rutier lipsă / Нет знака', 'Lipsă semn STOP / Нет знака СТОП la intersecție', 3, 'progress', 'Elena C.', '', 'Căușeni, str. Libertății', '2026-05-01'],
      [1747000006, 47.3834, 28.8207, 'Stradă inundată / Затопленная дорога', 'Canalizare înfundată / Забита канализация', 2, 'fixed', 'Ion D.', '', 'Orhei, str. Vasile Lupu', '2026-04-18'],
      [1747000007, 47.2113, 27.8001, 'Carosabil deteriorat / Разбитая дорога', 'Drum degradat după iarnă / Дорога разбита после зимы', 4, 'new', 'Petru G.', '', 'Ungheni, str. Principală', '2026-05-14'],
    ];
    for (const s of seed) {
      await pool.query(
        `INSERT INTO reports (id,lat,lng,type,description,severity,status,name,email,addr,report_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        s
      );
    }
    console.log('Seeded 7 sample reports');
  }
}

// ─── Routes ───────────────────────────────────────────────────

// GET all reports (newest first)
app.get('/api/reports', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM reports ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/reports:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST create new report
app.post('/api/reports', async (req, res) => {
  try {
    const { id, lat, lng, type, description, severity, status, name, email, addr, photo, report_date } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reports (id,lat,lng,type,description,severity,status,name,email,addr,photo,report_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, lat, lng, type, description || '', severity || 2, status || 'new',
       name || 'Anonim', email || '', addr || '', photo || null, report_date]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/reports:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH update status (for admin / primărie)
app.patch('/api/reports/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'progress', 'fixed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { rows } = await pool.query(
      'UPDATE reports SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/reports:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE report (admin only)
app.delete('/api/reports/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/reports:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Monitor Local server running on port ${PORT}`);
      console.log(`Open: http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
