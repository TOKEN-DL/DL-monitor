// 监控流水线：抓取 → 去重 → AI 分析 → 持久化 → 通知
import { getAllSources } from '../sources/index.js';
import { insertHotspotIfNew, updateHotspotAI, statusRepo, keywordsRepo, hotspotsRepo } from '../db.js';
import { broadcast } from '../notify/socket.js';
import { config } from '../config.js';
import { analyzeItem } from '../ai/analyze.js';
import { createAccountSource, parseAccountKeyword } from '../sources/account-resolver.js';

const NOTIFY_IMPORTANCE_THRESHOLD = 0.75;

export async function runSource(name) {
  const source = getAllSources().find(s => s.name === name);
  if (!source) return { ok: false, error: 'source_not_found' };
  const t0 = Date.now();
  try {
    const items = await source.fetch();
    let newCount = 0;
    let analyzedCount = 0;
    const newHotspots = [];

    for (const item of items) {
      const { isNew, id } = insertHotspotIfNew({ ...item, source: name });
      if (!isNew) continue;
      newCount++;

      // AI 分析（仅对新增条目）
      try {
        if (config.openrouter.enabled) {
          const ai = await analyzeItem(item);
          updateHotspotAI(id, {
            ai_score: ai.score,
            ai_importance: ai.importance,
            ai_summary: ai.summary,
            matched_keywords: ai.matched_keywords,
            title_zh: ai.title_zh,
          });
          analyzedCount++;
          const row = hotspotsRepo.get(id);
          newHotspots.push(row);
        }
      } catch (e) {
        console.warn(`[pipeline:${name}] ai failed for id=${id}`, e.message);
      }
    }

    statusRepo.update(name, { status: 'ok', count: newCount });

    // 实时 WebSocket 推送
    if (newCount > 0) {
      broadcast('source_run', { source: name, new: newCount, total: items.length });
      if (newHotspots.length) {
        for (const h of newHotspots.slice(0, 10)) {
          const meta = h.meta ? safeJSON(h.meta) : null;
          const matched = h.matched_keywords ? safeJSON(h.matched_keywords) : [];
          broadcast('hotspot', {
            id: h.id,
            source: h.source,
            url: h.url,
            title: h.title,
            title_zh: h.title_zh,
            summary: h.ai_summary,
            score: h.ai_score,
            importance: h.ai_importance,
            matched_keywords: matched,
            meta,
            published_at: h.published_at,
            fetched_at: h.fetched_at,
          });
        }
      }
      // Web Push 高重要性
      const important = newHotspots.filter(h => (h.ai_importance || 0) >= NOTIFY_IMPORTANCE_THRESHOLD);
      if (important.length && global.__dlmonitor?.sendPushAll) {
        for (const h of important.slice(0, 3)) {
          try {
            await global.__dlmonitor.sendPushAll({
              title: `[${h.source}] ${h.title.slice(0, 80)}`,
              body: (h.ai_summary || '').slice(0, 200) || '点击查看详情',
              url: h.url,
              tag: `hotspot-${h.id}`,
            });
            hotspotsRepo.markNotified(h.id);
          } catch (e) {
            console.warn('[push] failed', e.message);
          }
        }
      }
    }

    return { ok: true, source: name, fetched: items.length, new: newCount, analyzed: analyzedCount, took_ms: Date.now() - t0 };
  } catch (e) {
    statusRepo.update(name, { status: 'error', error: e.message });
    console.error(`[pipeline:${name}]`, e);
    return { ok: false, source: name, error: e.message };
  }
}

export async function runAll() {
  const results = {};
  for (const src of getAllSources()) {
    results[src.name] = await runSource(src.name);
  }
  // 跑账号识别（@xxx 关键词 → B站 UP主）
  const accountResults = await runAllAccountResolutions();
  for (const [k, v] of Object.entries(accountResults.results)) {
    results[k] = v;
  }
  return { results, ts: Date.now() };
}

/**
 * 账号识别：单个关键词
 */
export async function runAccountResolution(keyword) {
  const parsed = parseAccountKeyword(keyword.text);
  if (!parsed) return { ok: false, error: 'not_account_keyword' };

  const source = createAccountSource(parsed.platform, parsed.handle);
  const t0 = Date.now();
  try {
    const items = await source.fetch();
    let newCount = 0;
    let analyzedCount = 0;
    const newHotspots = [];

    for (const item of items) {
      const { isNew, id } = insertHotspotIfNew({ ...item, source: source.name });
      if (!isNew) continue;
      newCount++;
      try {
        if (config.openrouter.enabled) {
          const ai = await analyzeItem(item);
          updateHotspotAI(id, {
            ai_score: ai.score,
            ai_importance: ai.importance,
            ai_summary: ai.summary,
            matched_keywords: ai.matched_keywords,
            title_zh: ai.title_zh,
          });
          analyzedCount++;
          const row = hotspotsRepo.get(id);
          if (row) newHotspots.push(row);
        }
      } catch (e) {
        console.warn(`[pipeline:account] ai failed for id=${id}`, e.message);
      }
    }

    statusRepo.update(source.name, { status: 'ok', count: newCount });

    if (newCount > 0) {
      broadcast('source_run', { source: source.name, new: newCount, total: items.length });
      if (newHotspots.length) {
        for (const h of newHotspots.slice(0, 10)) {
          const meta = h.meta ? safeJSON(h.meta) : null;
          const matched = h.matched_keywords ? safeJSON(h.matched_keywords) : [];
          broadcast('hotspot', {
            id: h.id,
            source: h.source,
            url: h.url,
            title: h.title,
            title_zh: h.title_zh,
            summary: h.ai_summary,
            score: h.ai_score,
            importance: h.ai_importance,
            matched_keywords: matched,
            meta,
            published_at: h.published_at,
            fetched_at: h.fetched_at,
          });
        }
      }
      // Web Push 高重要性
      const important = newHotspots.filter(h => (h.ai_importance || 0) >= NOTIFY_IMPORTANCE_THRESHOLD);
      if (important.length && global.__dlmonitor?.sendPushAll) {
        for (const h of important.slice(0, 3)) {
          try {
            await global.__dlmonitor.sendPushAll({
              title: `[账号] ${h.title.slice(0, 80)}`,
              body: (h.ai_summary || '').slice(0, 200) || '点击查看详情',
              url: h.url,
              tag: `hotspot-${h.id}`,
            });
            hotspotsRepo.markNotified(h.id);
          } catch (e) {
            console.warn('[push] account failed', e.message);
          }
        }
      }
    }

    return { ok: true, source: source.name, fetched: items.length, new: newCount, analyzed: analyzedCount, took_ms: Date.now() - t0 };
  } catch (e) {
    statusRepo.update(source.name, { status: 'error', error: e.message });
    console.error(`[pipeline:account]`, e);
    return { ok: false, source: source.name, error: e.message };
  }
}

/**
 * 批量账号识别：遍历所有 @xxx 关键词
 */
export async function runAllAccountResolutions() {
  const results = {};
  const accountKeywords = keywordsRepo.enabled().filter(k => parseAccountKeyword(k.text));
  if (accountKeywords.length === 0) {
    return { results, ts: Date.now() };
  }
  for (const kw of accountKeywords) {
    const r = await runAccountResolution(kw);
    results[`account:${kw.text}`] = r;
  }
  return { results, ts: Date.now() };
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }