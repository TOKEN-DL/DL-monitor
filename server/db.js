// 数据库：使用 Node 24 内置 node:sqlite（与 better-sqlite3 API 兼容）
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'general',
  enabled INTEGER DEFAULT 1,
  notify_threshold REAL DEFAULT 0.6,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  meta TEXT,
  published_at INTEGER,
  fetched_at INTEGER NOT NULL,
  content_hash TEXT UNIQUE NOT NULL,
  ai_score REAL,
  ai_importance REAL,
  ai_summary TEXT,
  matched_keywords TEXT,
  notified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hotspots_fetched ON hotspots(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_score ON hotspots(ai_importance DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_source ON hotspots(source);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_status (
  source TEXT PRIMARY KEY,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  last_count INTEGER
);

CREATE TABLE IF NOT EXISTS ai_cache (
  content_hash TEXT PRIMARY KEY,
  score REAL,
  importance REAL,
  summary TEXT,
  matched_keywords TEXT,
  created_at INTEGER NOT NULL
);
`;

db.exec(SCHEMA);

// Prepared statements
const stmtFindHash = db.prepare('SELECT id FROM hotspots WHERE content_hash = ?');
const stmtInsertHotspot = db.prepare(`
  INSERT INTO hotspots
    (source, source_id, url, title, content, meta, published_at, fetched_at, content_hash,
     ai_score, ai_importance, ai_summary, matched_keywords)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function hashContent(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function insertHotspotIfNew(item) {
  const hash = hashContent(item.url);
  const exists = stmtFindHash.get(hash);
  if (exists) return { isNew: false, id: exists.id };
  const info = stmtInsertHotspot.run(
    item.source,
    item.source_id || null,
    item.url,
    item.title || '(no title)',
    item.content || null,
    item.meta ? JSON.stringify(item.meta) : null,
    item.published_at || null,
    Date.now(),
    hash,
    item.ai_score ?? null,
    item.ai_importance ?? null,
    item.ai_summary ?? null,
    item.matched_keywords ? JSON.stringify(item.matched_keywords) : null,
  );
  return { isNew: true, id: info.lastInsertRowid };
}

export function updateHotspotAI(id, { ai_score, ai_importance, ai_summary, matched_keywords }) {
  db.prepare(`
    UPDATE hotspots
    SET ai_score = ?, ai_importance = ?, ai_summary = ?, matched_keywords = ?
    WHERE id = ?
  `).run(
    ai_score ?? null,
    ai_importance ?? null,
    ai_summary ?? null,
    matched_keywords ? JSON.stringify(matched_keywords) : null,
    id,
  );
}

export const keywordsRepo = {
  list() {
    return db.prepare('SELECT * FROM keywords ORDER BY id DESC').all();
  },
  add(text, category = 'general') {
    const stmt = db.prepare('INSERT OR IGNORE INTO keywords (text, category, created_at) VALUES (?, ?, ?)');
    const info = stmt.run(text.trim(), category, Date.now());
    if (info.changes === 0) return null;
    return db.prepare('SELECT * FROM keywords WHERE id = ?').get(info.lastInsertRowid);
  },
  get(id) {
    return db.prepare('SELECT * FROM keywords WHERE id = ?').get(id);
  },
  remove(id) {
    return db.prepare('DELETE FROM keywords WHERE id = ?').run(id).changes;
  },
  toggle(id, enabled) {
    return db.prepare('UPDATE keywords SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id).changes;
  },
  setThreshold(id, threshold) {
    return db.prepare('UPDATE keywords SET notify_threshold = ? WHERE id = ?').run(threshold, id).changes;
  },
  enabled() {
    return db.prepare('SELECT * FROM keywords WHERE enabled = 1').all();
  },
};

export const hotspotsRepo = {
  list({ limit = 100, source = null, minImportance = 0, keyword = null } = {}) {
    const where = [];
    const params = [];
    if (source) { where.push('source = ?'); params.push(source); }
    if (minImportance) { where.push('(ai_importance IS NULL OR ai_importance >= ?)'); params.push(minImportance); }
    if (keyword) { where.push('matched_keywords LIKE ?'); params.push(`%${keyword}%`); }
    const sql = `SELECT * FROM hotspots ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(ai_importance, 0.5) DESC, fetched_at DESC LIMIT ?`;
    params.push(limit);
    return db.prepare(sql).all(...params);
  },
  since(ts) {
    return db.prepare('SELECT * FROM hotspots WHERE fetched_at >= ? ORDER BY fetched_at DESC').all(ts);
  },
  markNotified(id) {
    db.prepare('UPDATE hotspots SET notified_at = ? WHERE id = ?').run(Date.now(), id);
  },
  get(id) {
    return db.prepare('SELECT * FROM hotspots WHERE id = ?').get(id);
  },
};

export const subsRepo = {
  add(sub) {
    const stmt = db.prepare('INSERT OR IGNORE INTO subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)');
    return stmt.run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now()).changes > 0;
  },
  remove(endpoint) {
    return db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(endpoint).changes;
  },
  all() {
    return db.prepare('SELECT * FROM subscriptions').all();
  },
};

export const statusRepo = {
  update(source, { status, error, count }) {
    db.prepare(`
      INSERT INTO source_status (source, last_run_at, last_status, last_error, last_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        last_run_at = excluded.last_run_at,
        last_status = excluded.last_status,
        last_error = excluded.last_error,
        last_count = excluded.last_count
    `).run(source, Date.now(), status || 'ok', error || null, count ?? null);
  },
  list() {
    return db.prepare('SELECT * FROM source_status').all();
  },
};

export const aiCache = {
  get(hash) {
    return db.prepare('SELECT * FROM ai_cache WHERE content_hash = ?').get(hash);
  },
  put(hash, data) {
    db.prepare(`
      INSERT OR REPLACE INTO ai_cache (content_hash, score, importance, summary, matched_keywords, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      hash,
      data.score ?? null,
      data.importance ?? null,
      data.summary ?? null,
      data.matched_keywords ? JSON.stringify(data.matched_keywords) : null,
      Date.now(),
    );
  },
};