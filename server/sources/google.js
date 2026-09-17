// Google News 数据源（通过 rss2json 代理，国内可达）
//   - 直连 news.google.com 在国内被 GFW 拦截
//   - rss2json 把 RSS 转 JSON，每天免费 10000 次
//   - 端点：https://api.rss2json.com/v1/api.json?rss_url=...
//   - 过滤：仅时间窗（无浏览量代理字段）
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';
import { filterGoogle } from './quality.js';

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';

export function google() {
  return defineSource('google', async () => {
    const queries = config.google.queries;
    if (!queries.length) {
      console.warn('[source:google] GOOGLE_QUERIES empty, skip');
      return [];
    }

    const limitedQueries = queries.slice(0, 5);
    const settled = await Promise.allSettled(
      limitedQueries.map(q => safeFetchJSONViaProxy(q))
    );

    const all = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const q = limitedQueries[i];
      if (r.status === 'fulfilled') {
        all.push(...r.value);
      } else {
        console.warn(`[source:google] q="${q}" failed:`, r.reason?.message);
      }
    }

    // 去重（同一 URL 可能跨关键词出现）
    const seen = new Set();
    const deduped = all.filter(it => {
      if (seen.has(it.url)) return false;
      seen.add(it.url);
      return true;
    });

    const before = deduped.length;
    const { items: filtered, dropped, stats } = filterGoogle(deduped, {
      windowHours: config.google.windowHours,
    });
    if (dropped > 0) {
      console.log(`[source:google] filter: ${before} → ${filtered.length} (time:${stats.byTime})`);
    }

    return filtered;
  }, { description: 'Google News (via rss2json 代理)' });
}

async function safeFetchJSONViaProxy(keyword) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  // 注意：count 参数需要 api_key（付费）；默认免费版返回 ~10 条
  const url = `${RSS2JSON}?rss_url=${encodeURIComponent(rssUrl)}`;
  const json = await safeFetchJSON(url, {
    timeout: 20000,
    headers: { 'User-Agent': 'DL-monitor/0.1 (+https://localhost)' },
  });
  if (json.status !== 'ok') {
    throw new Error(`rss2json status=${json.status} message=${json.message || 'unknown'}`);
  }
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map(toItem).filter(Boolean);
}

function toItem(it) {
  // 从 description 提取来源媒体名（如 "Business Insider" 在 </a> 后）
  // description 形如 "<a href="...">Title</a>&nbsp;&nbsp;SourceName"
  const desc = stripHtml(it.description || '');
  const pubDateRaw = it.pubDate || '';
  // rss2json pubDate 格式："2026-09-14 22:35:00"（已转 UTC 时间戳字符串）
  const publishedAt = pubDateRaw ? Date.parse(pubDateRaw) : null;

  // 从 desc 末尾提取来源（最后一段逗号后的媒体名）
  // "Google Finally Lets All Engineers Use Anthropic's Claude Business Insider"
  // rss2json 不在 JSON 里直接提供 source_news，需要从 description 解析
  // 通常格式：title + &nbsp;&nbsp; + source，截取最后一段
  const rawHtml = it.description || '';
  const sourceMatch = rawHtml.match(/<\/a>(?:&nbsp;|\s)*([^<]+?)$/i);
  const sourceNews = sourceMatch ? stripHtml(sourceMatch[1]) : '';

  // title 也常带 &nbsp;&nbsp;Source 后缀，剔除
  let title = stripHtml(it.title || '');
  if (sourceNews && title.endsWith(sourceNews)) {
    title = title.slice(0, -sourceNews.length).trim();
  }

  if (!title || !it.link) return null;

  return {
    title,
    url: it.link,
    content: desc.slice(0, 800),
    source_id: it.guid || it.link,
    published_at: Number.isFinite(publishedAt) ? publishedAt : null,
    meta: {
      source_news: sourceNews,
      author: it.author || '',
      thumbnail: it.thumbnail || '',
    },
  };
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}