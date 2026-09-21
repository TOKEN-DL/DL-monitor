import { Router } from 'express';
import { keywordsRepo, hotspotsRepo, statusRepo, whitelistRepo, sourcesRepo } from '../db.js';
import { config } from '../config.js';
import { runRetention, retentionStats } from '../monitor/retention.js';
import { initSources } from '../sources/index.js';
import { fetchUserSourceOnce } from '../sources/user-source.js';
import { stopScheduler, startScheduler } from '../monitor/scheduler.js';

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
  const {
    limit, source, sources,            // source 单值（旧），sources 多值（新）
    min_importance, min_importance_max,
    keyword, keywords,                  // keyword 单值（旧），keywords 多值（新）
    min_views, min_followers, archive,
    sort,                              // recent / published / importance / burst
    window,                            // 1h / 6h / 24h / 3d / 7d / all
    quick_tag,                         // kol,burst 逗号分隔
  } = req.query;
  // 默认应用两层过滤：twitter 走配置阈值；其他源走各自的浏览量/粉丝阈值
  const defaultMinViews = config.twitter.minViews;
  const defaultMinFollowers = config.twitter.minFollowers;
  const defaultMinImportance = config.display.minImportance;
  const minViews = min_views === undefined ? defaultMinViews : Number(min_views);
  const minFollowers = min_followers === undefined ? defaultMinFollowers : Number(min_followers);
  // 重要度阈值：min_importance=-1 或 0 表示禁用；其他值表示最低 AI 重要度
  const minImportance = min_importance === undefined ? defaultMinImportance : Number(min_importance);
  const maxImportance = min_importance_max === undefined ? 1.0 : Number(min_importance_max);
  // 信息保留策略过滤：默认 active（仅显示 7 天内）
  // archive=archived → 只看归档；archive=all → 全部（含归档）
  const archiveMode = archive || 'active';
  const windowMs = config.retention.windowDays * 86400 * 1000;
  // 时间窗覆盖：'all' = 0；其他按预设
  const customWindowMs = (() => {
    if (!window || window === 'all') return 0;
    const map = { '1h': 3600 * 1000, '6h': 6 * 3600 * 1000, '24h': 24 * 3600 * 1000, '3d': 3 * 86400 * 1000, '7d': 7 * 86400 * 1000 };
    return map[window] ?? windowMs;
  })();
  // 排序：默认 recent（fetched DESC）
  const sortMode = ['recent', 'published', 'importance', 'burst'].includes(sort) ? sort : 'recent';
  // 来源多选
  const sourcesArr = sources ? String(sources).split(',').filter(Boolean) : null;
  // 关键词多选
  const keywordsArr = keywords ? String(keywords).split(',').filter(Boolean) : null;
  // 一键标签
  const quickTagsArr = quick_tag ? String(quick_tag).split(',').filter(Boolean) : [];

  let items = hotspotsRepo.list({
    limit: limit ? Number(limit) : 100,
    source: source || null,
    sources: sourcesArr,
    minImportance: minImportance > 0 ? minImportance : 0,
    maxImportance,
    keyword: keyword || null,
    keywords: keywordsArr,
    archive: archiveMode,
    windowMs,
    customWindowMs,
    sort: sortMode,
    quickTags: quickTagsArr,
  }).map(h => ({
    ...h,
    meta: h.meta ? safeJSON(h.meta) : null,
    matched_keywords: h.matched_keywords ? safeJSON(h.matched_keywords) : [],
  }));

  // 过滤：已禁用的信息源（无论是内置还是用户源）的热点不在列表中出现
  // 数据保留在 DB，重新启用后会重新显示
  const enabledSources = sourcesRepo.enabledSet();
  const beforeDisabled = items.length;
  items = items.filter((h) => enabledSources.has(h.source));
  if (items.length < beforeDisabled) {
    console.log(`[api/hotspots] disabled-source filter ${beforeDisabled} → ${items.length}`);
  }

  // 前端二次过滤：过滤低浏览量 / 低粉丝条目（即使绕过前端也能保证）
  // 仅对 active 模式执行（archived 是已通过门槛的，无需重复过滤）
  if (archiveMode === 'active' && (minViews > 0 || minFollowers > 0)) {
    const before = items.length;
    items = items.filter((h) => {
      const meta = h.meta || {};
      // 仅对原始推文（非白名单、非转发/引用）执行严格阈值
      const isRT = meta.isRetweet || meta.isQuote || meta.startsWithRt;
      const isWhitelisted = meta.whitelisted === true;
      // 转发 / 引用 / 引用回复：放行（这些 meta 字段缺失就是原始推文）
      if (isRT && !isWhitelisted) return true;
      // 原始推文：按 source 走各自阈值
      if (h.source === 'twitter') {
        if (minViews > 0 && (meta.views || 0) < minViews) return false;
        if (minFollowers > 0 && (meta.followers || 0) < minFollowers) return false;
      } else if (h.source === 'bilibili' && meta.is_up_master) {
        if (minFollowers > 0 && (meta.fans || 0) < minFollowers) return false;
      }
      return true;
    });
    if (items.length < before) {
      console.log(`[api/hotspots] frontend filter ${before} → ${items.length} (min_views=${minViews}, min_followers=${minFollowers})`);
    }
  }

  res.json({ items });
});

// 按来源计数（用于前端 chip 显示匹配数）— C3
router.get('/hotspots/count-by-source', (req, res) => {
  const {
    source, sources, min_importance, min_importance_max,
    keyword, keywords, min_followers, archive,
    window, quick_tag,
  } = req.query;
  const defaultMinFollowers = config.twitter.minFollowers;
  const defaultMinImportance = config.display.minImportance;
  const minImportance = min_importance === undefined ? defaultMinImportance : Number(min_importance);
  const maxImportance = min_importance_max === undefined ? 1.0 : Number(min_importance_max);
  const archiveMode = archive || 'active';
  const windowMs = config.retention.windowDays * 86400 * 1000;
  const customWindowMs = (() => {
    if (!window || window === 'all') return 0;
    const map = { '1h': 3600 * 1000, '6h': 6 * 3600 * 1000, '24h': 24 * 3600 * 1000, '3d': 3 * 86400 * 1000, '7d': 7 * 86400 * 1000 };
    return map[window] ?? windowMs;
  })();
  const sourcesArr = sources ? String(sources).split(',').filter(Boolean) : null;
  const keywordsArr = keywords ? String(keywords).split(',').filter(Boolean) : null;
  const quickTagsArr = quick_tag ? String(quick_tag).split(',').filter(Boolean) : [];

  const { counts, total } = hotspotsRepo.countBySource({
    source: source || null,
    sources: sourcesArr,
    minImportance: minImportance > 0 ? minImportance : 0,
    maxImportance,
    keyword: keyword || null,
    keywords: keywordsArr,
    archive: archiveMode,
    windowMs,
    customWindowMs,
    quickTags: quickTagsArr,
  });

  // 已禁用的源计数清零
  const enabledSources = sourcesRepo.enabledSet();
  for (const k of Object.keys(counts)) {
    if (!enabledSources.has(k)) delete counts[k];
  }

  res.json({ items: counts, total });
});

router.post('/hotspots/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const changes = hotspotsRepo.archive(id);
  res.json({ ok: changes > 0, id, archived: changes > 0 });
});

router.post('/hotspots/:id/unarchive', (req, res) => {
  const id = Number(req.params.id);
  const changes = hotspotsRepo.unarchive(id);
  res.json({ ok: changes > 0, id, unarchived: changes > 0 });
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
  // 信息源列表（内置 + 用户，统一来自 sources 表）
  const allSources = sourcesRepo.list();
  const sourcesMap = {};
  for (const s of allSources) {
    sourcesMap[s.name] = { label: s.label, enabled: !!s.enabled, kind: s.kind };
  }
  res.json({
    now: Date.now(),
    openrouter: {
      enabled: config.openrouter.enabled,
      classify_model: config.openrouter.classifyModel,
      summarize_model: config.openrouter.summarizeModel,
    },
    // 旧版 sources 仍返回 boolean map，保持向后兼容（前端老组件可能用）
    sources_legacy: config.sources,
    // 新版 sources 元数据
    sources: allSources.map((s) => ({
      name: s.name,
      label: s.label,
      kind: s.kind,
      enabled: !!s.enabled,
      url: s.config ? safeJSON(s.config)?.url : null,
      last_run_at: s.last_run_at,
      last_status: s.last_status,
      last_error: s.last_error,
      last_count: s.last_count,
    })),
    sources_map: sourcesMap,
    // 前端二次过滤阈值（即使绕过前端也能保证）
    filters: {
      minViews: config.twitter.minViews,
      minFollowers: config.twitter.minFollowers,
      minImportance: config.display.minImportance,
      windowHours: config.twitter.windowHours,
    },
    // 信息保留策略状态
    retention: retentionStats(),
    source_status: sourceStatus,
    whitelist_count: whitelistRepo.count(),
    vapid_configured: !!config.vapid.publicKey,
    smtp_configured: config.smtp.enabled,
  });
});

// ---------- sources (CRUD：内置源仅可切换 enabled；用户源可增删改) ----------
router.get('/sources', (req, res) => {
  res.json({ items: sourcesRepo.list() });
});

router.post('/sources', async (req, res) => {
  const { name, label, url, enabled = true, test_fetch = true } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'url must start with http(s)://' });
  }
  const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_\-:.]/g, '-').slice(0, 60);
  // 不允许占用内置源 name
  if (/^(hackernews|github|huggingface|arxiv|twitter|bilibili|google|zhihu-trends|weibo-trends)$/.test(safeName)) {
    return res.status(400).json({ error: `不能使用内置源名称: ${safeName}` });
  }
  // name 前缀 'user:' 强制加
  const finalName = safeName.startsWith('user:') ? safeName : `user:${safeName}`;

  // 测试抓取（可选，失败允许添加但记录错误）
  let testOk = false;
  let testError = null;
  let testCount = 0;
  if (test_fetch) {
    try {
      const row = sourcesRepo.addUser({ name: finalName, label, url, enabled });
      if (!row) {
        return res.status(409).json({ error: `source name '${finalName}' already exists` });
      }
      try {
        const items = await fetchUserSourceOnce(finalName);
        testCount = items.length;
        testOk = items.length > 0;
      } catch (e) {
        testError = e.message;
      }
      if (enabled) restartScheduler();
      const finalRow = sourcesRepo.get(finalName);
      return res.json({ ...finalRow, test_ok: testOk, test_count: testCount, test_error: testError });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const row = sourcesRepo.addUser({ name: finalName, label, url, enabled });
  if (!row) {
    return res.status(409).json({ error: `source name '${finalName}' already exists` });
  }
  if (enabled) restartScheduler();
  res.json(row);
});

router.patch('/sources/:name', (req, res) => {
  const name = req.params.name;
  const row = sourcesRepo.get(name);
  if (!row) return res.status(404).json({ error: 'source not found' });
  const { enabled, label } = req.body || {};
  let changed = false;
  if (typeof enabled === 'boolean') {
    const ok = sourcesRepo.setEnabled(name, enabled);
    if (!ok) return res.status(400).json({ error: 'failed to toggle' });
    changed = true;
  }
  if (typeof label === 'string' && label.trim() && label !== row.label) {
    const ok = sourcesRepo.renameLabel(name, label.trim());
    if (!ok) return res.status(400).json({ error: 'failed to rename' });
    changed = true;
  }
  if (changed) restartScheduler();
  res.json(sourcesRepo.get(name));
});

router.delete('/sources/:name', (req, res) => {
  const name = req.params.name;
  const row = sourcesRepo.get(name);
  if (!row) return res.status(404).json({ error: 'source not found' });
  if (row.kind !== 'user') {
    return res.status(400).json({ error: '内置源不能删除（仅可切换开关）' });
  }
  const changes = sourcesRepo.remove(name);
  restartScheduler();
  res.json({ ok: changes > 0, id: name });
});

/**
 * 重启 scheduler + 重建 registry（添加 / 切换 / 删除源后必须调用）
 */
function restartScheduler() {
  try {
    initSources();
    stopScheduler();
    startScheduler();
  } catch (e) {
    console.warn('[api/sources] restart scheduler failed:', e.message);
  }
}

// ---------- retention ----------
router.get('/retention/stats', (req, res) => {
  res.json(retentionStats());
});

router.post('/retention/run', async (req, res) => {
  try {
    const result = await runRetention();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- twitter whitelist ----------
router.get('/twitter-whitelist', (req, res) => {
  res.json({ items: whitelistRepo.list() });
});

router.post('/twitter-whitelist', (req, res) => {
  const { handle, type, note } = req.body || {};
  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ error: 'handle is required' });
  }
  const row = whitelistRepo.add(handle, type || 'person', note || '');
  if (!row) return res.status(409).json({ error: 'handle already exists' });
  res.json(row);
});

router.delete('/twitter-whitelist/:id', (req, res) => {
  const changes = whitelistRepo.remove(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
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