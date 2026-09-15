// OpenRouter 封装：fetch 直连，含重试与限流退避
import { config } from '../config.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

let inflight = 0;
let totalCalls = 0;
let totalErrors = 0;

export function getStats() {
  return { inflight, totalCalls, totalErrors };
}

export async function chatCompletion({ model, messages, temperature = 0.2, max_tokens = 500, json = false, timeout = 30000 }) {
  if (!config.openrouter.key) {
    throw new Error('OPENROUTER_KEY not configured');
  }
  const body = {
    model,
    messages,
    temperature,
    max_tokens,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  const maxRetries = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    inflight++;
    totalCalls++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouter.key}`,
          'HTTP-Referer': config.openrouter.referer,
          'X-Title': config.openrouter.title,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (r.status === 429 || r.status >= 500) {
        const retryAfter = Number(r.headers.get('retry-after')) || (attempt + 1) * 2;
        console.warn(`[openrouter] ${r.status}, backing off ${retryAfter}s (attempt ${attempt + 1})`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      const data = await r.json();
      const content = data.choices?.[0]?.message?.content || '';
      return { content, usage: data.usage || null, raw: data };
    } catch (e) {
      lastErr = e;
      totalErrors++;
      if (attempt < maxRetries - 1) {
        await sleep((attempt + 1) * 1500);
      }
    } finally {
      clearTimeout(t);
      inflight--;
    }
  }
  throw lastErr || new Error('openrouter failed');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 简单的 JSON 提取（容忍模型返回带 ```json 围栏的内容）
export function extractJSON(text) {
  if (!text) return null;
  // 1. 尝试直接 parse
  try { return JSON.parse(text); } catch { /* */ }
  // 2. 提取 ```json ... ``` 块
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) {
    try { return JSON.parse(m[1].trim()); } catch { /* */ }
  }
  // 3. 提取第一个 { ... } 块
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* */ }
  }
  return null;
}