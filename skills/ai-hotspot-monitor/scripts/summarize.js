#!/usr/bin/env node
// 聚合指定时间窗口的热点
import process from 'node:process';

const URL = process.env.DL_MONITOR_URL || 'http://localhost:3000';
const args = parseArgs(process.argv.slice(2));

const params = new URLSearchParams();
params.set('hours', String(args.hours || 24));
if (args.source) params.set('source', args.source);
if (args.min_importance !== undefined) params.set('min_importance', String(args.min_importance));
params.set('limit', String(args.limit || 50));

async function main() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  const r = await fetch(`${URL}/api/hotspots/summary?${params}`, { signal: ctrl.signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const result = {
    ok: true,
    server_url: URL,
    hours: data.hours,
    count: data.count,
    items: (data.items || []).map(h => ({
      id: h.id,
      source: h.source,
      title: h.title,
      summary: h.ai_summary,
      score: h.ai_score,
      importance: h.ai_importance,
      matched_keywords: typeof h.matched_keywords === 'string' ? safeJSON(h.matched_keywords) : h.matched_keywords,
      url: h.url,
      fetched_at: h.fetched_at,
    })),
  };
  console.log(JSON.stringify(result, null, 2));
  clearTimeout(t);
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return []; } }

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const k = m[1];
    const v = m[2] !== undefined ? m[2] : true;
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) {
      out[k] = Number(v);
    } else if (v === 'true') {
      out[k] = true;
    } else if (v === 'false') {
      out[k] = false;
    } else {
      out[k] = v;
    }
  }
  return out;
}

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});