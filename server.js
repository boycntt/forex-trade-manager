const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static files
const publicDir = path.join(__dirname, 'public');
console.log('Static dir:', publicDir);
console.log('Exists:', fs.existsSync(publicDir));
if (fs.existsSync(publicDir)) {
  console.log('Files:', fs.readdirSync(publicDir));
}
app.use(express.static(publicDir));

// Database
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'trading.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, time TEXT, pair TEXT NOT NULL,
    direction TEXT CHECK(direction IN ('BUY','SELL')),
    entry REAL, sl REAL, tp REAL, rr REAL,
    lot REAL, risk_pct REAL, result TEXT DEFAULT 'RUNNING',
    pnl REAL DEFAULT 0, setup TEXT, session TEXT,
    checklist TEXT, notes TEXT, emotions TEXT, lessons TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT, bias TEXT DEFAULT 'NEUTRAL', notes TEXT,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// API
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/trades', (req, res) => {
  let sql = 'SELECT * FROM trades WHERE 1=1'; const p = [];
  if (req.query.pair) { sql += ' AND pair LIKE ?'; p.push(`%${req.query.pair}%`); }
  if (req.query.result) { sql += ' AND result=?'; p.push(req.query.result); }
  sql += ' ORDER BY date DESC, time DESC';
  if (req.query.limit) { sql += ' LIMIT ?'; p.push(+req.query.limit); }
  res.json(db.prepare(sql).all(...p));
});

app.post('/api/trades', (req, res) => {
  const b = req.body;
  const r = db.prepare('INSERT INTO trades (date,time,pair,direction,entry,sl,tp,rr,lot,risk_pct,result,pnl,setup,session,checklist,notes,emotions,lessons) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(b.date,b.time,b.pair,b.direction,b.entry,b.sl,b.tp,b.rr,b.lot,b.risk_pct,b.result||'RUNNING',b.pnl||0,b.setup,b.session,b.checklist,b.notes,b.emotions,b.lessons);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/trades/:id', (req, res) => {
  const b = req.body;
  db.prepare('UPDATE trades SET date=?,time=?,pair=?,direction=?,entry=?,sl=?,tp=?,rr=?,lot=?,risk_pct=?,result=?,pnl=?,setup=?,session=?,checklist=?,notes=?,emotions=?,lessons=? WHERE id=?').run(b.date,b.time,b.pair,b.direction,b.entry,b.sl,b.tp,b.rr,b.lot,b.risk_pct,b.result,b.pnl,b.setup,b.session,b.checklist,b.notes,b.emotions,b.lessons,req.params.id);
  res.json({ ok: true });
});

app.delete('/api/trades/:id', (req, res) => {
  db.prepare('DELETE FROM trades WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/stats', (_, res) => {
  const q = s => db.prepare(s).get();
  const total = q("SELECT COUNT(*) as c FROM trades").c;
  const wins = q("SELECT COUNT(*) as c FROM trades WHERE result='WIN'").c;
  const losses = q("SELECT COUNT(*) as c FROM trades WHERE result='LOSS'").c;
  const be = q("SELECT COUNT(*) as c FROM trades WHERE result='BE'").c;
  res.json({
    total, wins, losses, be,
    winRate: total > 0 ? ((wins / (wins + losses + be)) * 100).toFixed(1) : 0,
    pnl: q("SELECT COALESCE(SUM(pnl),0) as s FROM trades").s,
    avgRR: q("SELECT COALESCE(AVG(rr),0) as a FROM trades WHERE result IN ('WIN','LOSS')").a.toFixed(2),
    daily: db.prepare("SELECT date, SUM(pnl) as pnl FROM trades GROUP BY date ORDER BY date DESC LIMIT 30").all().reverse()
  });
});

app.get('/api/watchlist', (_, res) => res.json(db.prepare('SELECT * FROM watchlist ORDER BY updated_at DESC').all()));
app.post('/api/watchlist', (req, res) => {
  const r = db.prepare('INSERT INTO watchlist (pair,bias,notes) VALUES (?,?,?)').run(req.body.pair, req.body.bias, req.body.notes);
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/watchlist/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// SPA fallback — must be AFTER static middleware
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Trading Journal on port ${PORT}`));
