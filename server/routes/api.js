import { Router } from 'express';
import { keywordsRepo, hotspotsRepo, statusRepo } from '../db.js';
import { config } from '../config.js';

const router = Router();

// ---------- keywords ----------
router.get('/keywords', (req, res) => {
  res.json({ items: keywordsRepo.list() });
});

router.post('/keywords', (req, res) => {
  const { text, category } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const row = keywordsRepo.add(text, category || 'general');
  if (!row) return res.status(409).json({ error: 'keyword already exists' });
  res.json(row);
});

router.delete('/keywords/:id', (req, res) => {
  const changes = keywordsRepo.remove(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.patch('/keywords/:id', (req, res) => {
  const id = Number(req.params.id);
  const { enabled, notify_threshold } = req.body || {};
  if (typeof enabled === 'boolean') keywordsRepo.toggle(id, enabled);
  if (typeof notify_threshold === 'number') keywordsRepo.setThreshold(id, notify_threshold);
  res.json(keywordsRepo.get(id));
});

// ---------- hotspots ----------
router.get('/hotspots', (req, res) => {
  const { limit, source, min_importance, keyword } = req.query;
  const items = hotspotsRepo.list({
    limit: limit ? Number(limit) : 100,
    source: source || null,
    minImportance: min_importance ? Number(min_importance) : 0,
    keyword: keyword || null,
  }).map(h => ({
    ...h,
    meta: h.meta ? safeJSON(h.meta) : null,
    matched_keywords: h.matched_keywords ? safeJSON(h.matched_keywords) : [],
  }));
  res.json({ items });
});

router.get('/hotspots/summary', (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  const since = Date.now() - hours * 3600 * 1000;
  const items = hotspotsRepo.since(since);
  res.json({ hours, count: items.length, items: items.slice(0, 50) });
});

// ---------- status ----------
router.get('/status', (req, res) => {
  const sourceStatus = statusRepo.list();
  res.json({
    now: Date.now(),
    openrouter: {
      enabled: config.openrouter.enabled,
      classify_model: config.openrouter.classifyModel,
      summarize_model: config.openrouter.summarizeModel,
    },
    sources: config.sources,
    source_status: sourceStatus,
    vapid_configured: !!config.vapid.publicKey,
    smtp_configured: config.smtp.enabled,
  });
});

// ---------- manual trigger ----------
router.post('/run', async (req, res) => {
  try {
    const { runAll } = await import('../monitor/pipeline.js');
    const result = await runAll();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ---------- live ws count (前端拉取用，简单实现) ----------
router.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

function safeJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export default router;