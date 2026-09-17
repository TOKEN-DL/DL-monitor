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
  title_zh TEXT,
  content TEXT,
  meta TEXT,
  published_at INTEGER,
  fetched_at INTEGER NOT NULL,
  content_hash TEXT UNIQUE NOT NULL,
  ai_score REAL,
  ai_importance REAL,
  ai_summary TEXT,
  matched_keywords TEXT,
  notified_at INTEGER,
  archived_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hotspots_fetched ON hotspots(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_score ON hotspots(ai_importance DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_source ON hotspots(source);
CREATE INDEX IF NOT EXISTS idx_hotspots_published ON hotspots(published_at DESC);

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
  title_zh TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS twitter_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'person',
  note TEXT,
  created_at INTEGER NOT NULL
);

-- 信息源注册表（统一管理内置源 + 用户新增源）
-- name: 来源 ID（如 'twitter' / 'user:abc-news'）
-- kind: 'builtin' = 内置（不可删除，仅切换 enabled）；'user' = 用户新增（可删/改/切）
-- config: JSON 字符串，用户源的 URL / 内置源的额外配置
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user',
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  last_count INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
`;

db.exec(SCHEMA);

// Schema migration: 给已存在的 hotspots 表添加 archived_at 列（信息保留策略）
const hotspotCols = db.prepare("PRAGMA table_info(hotspots)").all();
if (!hotspotCols.find(c => c.name === 'archived_at')) {
  db.exec('ALTER TABLE hotspots ADD COLUMN archived_at INTEGER');
  console.log('[db] migration: added hotspots.archived_at column');
}
if (!hotspotCols.find(c => c.name === 'title_zh')) {
  db.exec('ALTER TABLE hotspots ADD COLUMN title_zh TEXT');
  console.log('[db] migration: added hotspots.title_zh column');
}

const hotspotIdx = db.prepare("PRAGMA index_list(hotspots)").all();
if (!hotspotIdx.find(i => i.name === 'idx_hotspots_archived')) {
  db.exec('CREATE INDEX IF NOT EXISTS idx_hotspots_archived ON hotspots(archived_at, fetched_at DESC)');
}

const cacheCols = db.prepare("PRAGMA table_info(ai_cache)").all();
if (!cacheCols.find(c => c.name === 'title_zh')) {
  db.exec('ALTER TABLE ai_cache ADD COLUMN title_zh TEXT');
  console.log('[db] migration: added ai_cache.title_zh column');
}

// Prepared statements
const stmtFindHash = db.prepare('SELECT id FROM hotspots WHERE content_hash = ?');
const stmtInsertHotspot = db.prepare(`
  INSERT INTO hotspots
    (source, source_id, url, title, title_zh, content, meta, published_at, fetched_at, content_hash,
     ai_score, ai_importance, ai_summary, matched_keywords)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    item.title_zh || null,
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

export function updateHotspotAI(id, { ai_score, ai_importance, ai_summary, matched_keywords, title_zh }) {
  db.prepare(`
    UPDATE hotspots
    SET ai_score = ?, ai_importance = ?, ai_summary = ?, matched_keywords = ?, title_zh = ?
    WHERE id = ?
  `).run(
    ai_score ?? null,
    ai_importance ?? null,
    ai_summary ?? null,
    matched_keywords ? JSON.stringify(matched_keywords) : null,
    title_zh ?? null,
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
  /**
   * 列出热点
   * @param {Object} opts
   * @param {number} [opts.limit=100]
   * @param {string} [opts.source]
   * @param {number} [opts.minImportance=0]
   * @param {string} [opts.keyword]
   * @param {'active'|'archived'|'all'} [opts.archive='active'] - 信息保留策略过滤
   *   - active: archived_at IS NULL AND fetched_at >= now - windowDays
   *   - archived: archived_at IS NOT NULL
   *   - all: 不加过滤
   */
  list({ limit = 100, source = null, minImportance = 0, keyword = null, archive = 'active', windowMs = 0 } = {}) {
    const where = [];
    const params = [];
    if (source) { where.push('source = ?'); params.push(source); }
    if (minImportance) { where.push('(ai_importance IS NULL OR ai_importance >= ?)'); params.push(minImportance); }
    if (keyword) { where.push('matched_keywords LIKE ?'); params.push(`%${keyword}%`); }
    if (archive === 'active') {
      where.push('archived_at IS NULL');
      if (windowMs > 0) {
        where.push('fetched_at >= ?');
        params.push(Date.now() - windowMs);
      }
    } else if (archive === 'archived') {
      where.push('archived_at IS NOT NULL');
    }
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
  archive(id) {
    return db.prepare('UPDATE hotspots SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(Date.now(), id).changes;
  },
  unarchive(id) {
    return db.prepare('UPDATE hotspots SET archived_at = NULL WHERE id = ?').run(id).changes;
  },
  /** 取回所有候选项（信息保留策略用） */
  retentionCandidates(cutoff) {
    return db.prepare(`
      SELECT id, source, meta, fetched_at FROM hotspots
      WHERE archived_at IS NULL AND fetched_at < ?
    `).all(cutoff);
  },
  purge(id) {
    return db.prepare('DELETE FROM hotspots WHERE id = ?').run(id).changes;
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
      INSERT OR REPLACE INTO ai_cache (content_hash, score, importance, summary, matched_keywords, title_zh, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      hash,
      data.score ?? null,
      data.importance ?? null,
      data.summary ?? null,
      data.matched_keywords ? JSON.stringify(data.matched_keywords) : null,
      data.title_zh ?? null,
      Date.now(),
    );
  },
};

export const whitelistRepo = {
  list() {
    return db.prepare('SELECT * FROM twitter_whitelist ORDER BY id DESC').all();
  },
  add(handle, type = 'person', note = '') {
    const h = String(handle || '').trim().replace(/^@/, '').toLowerCase();
    if (!h) return null;
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO twitter_whitelist (handle, type, note, created_at) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(h, type, note, Date.now());
    if (info.changes === 0) return null;
    return db.prepare('SELECT * FROM twitter_whitelist WHERE id = ?').get(info.lastInsertRowid);
  },
  remove(id) {
    return db.prepare('DELETE FROM twitter_whitelist WHERE id = ?').run(id).changes;
  },
  hasSet() {
    // 返回 Set<lowercase handle> 给热路径用
    const rows = db.prepare('SELECT handle FROM twitter_whitelist').all();
    return new Set(rows.map(r => String(r.handle).toLowerCase()));
  },
  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM twitter_whitelist').get().n;
  },
};

/**
 * 信息源注册表
 * - 内置源（kind='builtin'）：仅可切换 enabled，不可删除
 * - 用户源（kind='user'）：可增删改切
 * - 删除用户源时同时清理对应 hotspots（避免孤儿数据）
 */
export const sourcesRepo = {
  list() {
    return db.prepare('SELECT * FROM sources ORDER BY kind DESC, id ASC').all();
  },
  listEnabled() {
    return db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY kind DESC, id ASC').all();
  },
  listUser() {
    return db.prepare("SELECT * FROM sources WHERE kind = 'user' ORDER BY id DESC").all();
  },
  get(name) {
    return db.prepare('SELECT * FROM sources WHERE name = ?').get(name);
  },
  getById(id) {
    return db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  },
  /**
   * 返回 Set<name>，热路径过滤用
   */
  enabledSet() {
    const rows = db.prepare('SELECT name FROM sources WHERE enabled = 1').all();
    return new Set(rows.map(r => r.name));
  },
  /**
   * 新增用户源
   * @returns {object|null} 新增行；name 重复返回 null
   */
  addUser({ name, label, url, enabled = 1 }) {
    const safeName = String(name || '').trim();
    const safeLabel = String(label || '').trim() || safeName;
    if (!safeName || !url) return null;
    const config = JSON.stringify({ url: String(url).trim() });
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO sources (name, label, kind, enabled, config, created_at)
      VALUES (?, ?, 'user', ?, ?, ?)
    `);
    const info = stmt.run(safeName, safeLabel, enabled ? 1 : 0, config, Date.now());
    if (info.changes === 0) return null;
    return db.prepare('SELECT * FROM sources WHERE id = ?').get(info.lastInsertRowid);
  },
  remove(name) {
    const row = this.get(name);
    if (!row || row.kind !== 'user') return 0;
    // 先清掉该源的热点
    db.prepare('DELETE FROM hotspots WHERE source = ?').run(name);
    return db.prepare('DELETE FROM sources WHERE name = ?').run(name).changes;
  },
  setEnabled(name, enabled) {
    return db.prepare('UPDATE sources SET enabled = ? WHERE name = ?')
      .run(enabled ? 1 : 0, name).changes;
  },
  renameLabel(name, label) {
    return db.prepare('UPDATE sources SET label = ? WHERE name = ?')
      .run(String(label || '').trim(), name).changes;
  },
  /**
   * 启动时 seed 内置源（如果 rows 不存在）
   * @param {Array<{name,label,defaultEnabled}>} builtins
   * @returns {Array<{name,action:'inserted'|'kept'|'toggled'}>}
   */
  seedBuiltins(builtins) {
    const results = [];
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO sources (name, label, kind, enabled, config, created_at)
      VALUES (?, ?, 'builtin', ?, ?, ?)
    `);
    // node:sqlite 没有 db.transaction()，手动 BEGIN/COMMIT
    db.exec('BEGIN');
    try {
      for (const b of builtins) {
        const r = insertStmt.run(b.name, b.label, b.defaultEnabled ? 1 : 0, null, Date.now());
        if (r.changes === 1) results.push({ name: b.name, action: 'inserted' });
        else results.push({ name: b.name, action: 'kept' });
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return results;
  },
  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM sources').get().n;
  },
};