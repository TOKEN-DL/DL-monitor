#!/usr/bin/env node
// 触发 DL-monitor 立即抓取并返回新增热点
import process from 'node:process';

const URL = process.env.DL_MONITOR_URL || 'http://localhost:3000';
const TIMEOUT = Number(process.env.DL_MONITOR_TIMEOUT) || 90000;

async function main() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);

  // 1) 触发抓取
  const runRes = await fetch(`${URL}/api/run`, {
    method: 'POST',
    signal: ctrl.signal,
  });
  if (!runRes.ok) {
    const txt = await runRes.text();
    throw new Error(`/api/run failed: HTTP ${runRes.status} ${txt}`);
  }
  const run = await runRes.json();

  // 2) 拉取最新热点
  const hsRes = await fetch(`${URL}/api/hotspots?limit=30`, { signal: ctrl.signal });
  const hs = await hsRes.json();

  // 3) 组合输出
  const result = {
    ok: true,
    ts: Date.now(),
    server_url: URL,
    results: run.results || {},
    total_new: Object.values(run.results || {}).reduce((s, r) => s + (r.new || 0), 0),
    new_hotspots: hs.items.slice(0, 20).map(h => ({
      id: h.id,
      source: h.source,
      url: h.url,
      title: h.title,
      summary: h.ai_summary,
      score: h.ai_score,
      importance: h.ai_importance,
      matched_keywords: typeof h.matched_keywords === 'string' ? safeJSON(h.matched_keywords) : h.matched_keywords,
      fetched_at: h.fetched_at,
    })),
  };
  console.log(JSON.stringify(result, null, 2));
  clearTimeout(t);
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return []; } }

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});