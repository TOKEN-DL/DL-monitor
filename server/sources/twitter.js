// X(Twitter) 数据源：使用 twitterapi.io（独立第三方 API，比官方便宜、稳定）
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';

const TWITTER_API_BASE = 'https://api.twitterapi.io';

export function twitter() {
  return defineSource('twitter', async () => {
    if (!config.twitter.apiKey) {
      console.warn('[source:twitter] TWITTER_API_KEY not set, skip');
      return [];
    }
    const queries = config.twitter.queries;
    if (!queries.length) {
      console.warn('[source:twitter] TWITTER_QUERIES empty, skip');
      return [];
    }

    // 并发抓取每个关键词的结果，限制最多 5 个查询以控制成本
    const limitedQueries = queries.slice(0, 5);
    const settled = await Promise.allSettled(
      limitedQueries.map(q => searchTweets(q, 'Latest'))
    );

    const items = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const query = limitedQueries[i];
      if (r.status === 'fulfilled') {
        items.push(...r.value);
      } else {
        console.warn(`[source:twitter] query="${query}" failed:`, r.reason?.message);
      }
    }
    return items;
  }, { description: 'X(Twitter) via twitterapi.io' });
}

/**
 * 调用 twitterapi.io advanced_search
 * @param {string} query - 关键词或 Twitter 高级搜索语法
 * @param {'Latest'|'Top'} queryType
 */
async function searchTweets(query, queryType = 'Latest') {
  const params = new URLSearchParams({
    query: wrapQuery(query),
    queryType,
  });
  const url = `${TWITTER_API_BASE}/twitter/tweet/advanced_search?${params}`;
  const json = await safeFetchJSON(url, {
    timeout: 15000,
    headers: {
      'X-API-Key': config.twitter.apiKey,
      'Accept': 'application/json',
    },
  });
  const tweets = Array.isArray(json.tweets) ? json.tweets : [];
  return tweets.map(toItem);
}

/**
 * 把用户的简单关键词包装成 Twitter 搜索语法：
 *   - 已经是高级搜索语法（含 from:/since: 等）直接用
 *   - 普通关键词用引号包裹，多词处理为 AND
 *   - 加上 filter 排除转发与回复以提高质量
 */
function wrapQuery(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // 如果已经包含 Twitter 高级搜索操作符，直接透传
  if (/[\s]*\b(from:|to:|since:|until:|filter:|lang:|near:|within:)/.test(s)) {
    return s;
  }
  // 普通关键词：加引号 + 排除转发
  const quoted = s.split(/\s+/).filter(Boolean).map(w => `"${w}"`).join(' ');
  return `${quoted} -filter:retweets`;
}

function toItem(t) {
  const author = t.author || {};
  const handle = author.userName || '';
  return {
    title: `${t.text || ''}`.slice(0, 200),
    url: t.url || `https://x.com/${handle}/status/${t.id}`,
    content: t.text || '',
    source_id: t.id ? String(t.id) : null,
    published_at: parseTwitterDate(t.createdAt),
    meta: {
      author: author.name || handle,
      handle,
      verified: !!author.isBlueVerified,
      followers: author.followers || 0,
      likes: t.likeCount || 0,
      retweets: t.retweetCount || 0,
      views: t.viewCount || 0,
      lang: t.lang || null,
    },
  };
}

function parseTwitterDate(s) {
  if (!s) return null;
  // Twitter 日期格式："Wed Oct 10 20:19:24 +0000 2018" 或 ISO 8601
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  const m = s.match(/^(\w{3}) (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) \+0000 (\d{4})$/);
  if (m) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const [, , mon, day, hh, mm, ss, year] = m;
    const d = new Date(Date.UTC(+year, months[mon], +day, +hh, +mm, +ss));
    return d.getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}