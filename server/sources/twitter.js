// X(Twitter) 数据源：使用 twitterapi.io
// 改造：白名单优先 + 三层质量过滤 + 白名单 handle 独立抓取
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';
import { whitelistRepo } from '../db.js';
import { filterTwitter } from './quality.js';

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

    const limitedQueries = queries.slice(0, 5);

    // 抓白名单 handle 的近况（跳过关键词搜索，直接拉这些 KOL 的近 6h 推文）
    const whitelistHandles = whitelistRepo.hasSet();
    const whitelistArr = Array.from(whitelistHandles).slice(0, 10);

    const tasks = [
      ...limitedQueries.map(q => safeQuery(q, 'Latest')),
      ...whitelistArr.map(h => safeQuery(`from:${h}`, 'Latest')),
    ];

    const settled = await Promise.allSettled(tasks);
    const items = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const taskName = i < limitedQueries.length
        ? `q="${limitedQueries[i]}"`
        : `from:${whitelistArr[i - limitedQueries.length]}`;
      if (r.status === 'fulfilled') {
        items.push(...r.value);
      } else {
        console.warn(`[source:twitter] ${taskName} failed:`, r.reason?.message);
      }
    }

    // 应用质量过滤
    const before = items.length;
    const { items: filtered, dropped, stats } = filterTwitter(items.map(toItem), {
      minFollowers: config.twitter.minFollowers,
      minViews: config.twitter.minViews,
      windowHours: config.twitter.windowHours,
      whitelistHandles,
    });
    if (dropped > 0) {
      console.log(
        `[source:twitter] filter: ${before} → ${filtered.length} ` +
        `(whitelist:${stats.whitelist} time:${stats.byTime} reply:${stats.byReply} ` +
        `followers<${config.twitter.minFollowers}:${stats.byFollowers} ` +
        `views<${config.twitter.minViews}:${stats.byViews})`
      );
    }

    return filtered;
  }, { description: 'X(Twitter) via twitterapi.io (whitelist + quality filtered)' });
}

/**
 * 调用 twitterapi.io advanced_search，自动翻页（每页 20 条，最深 3 页 = 180 条/查询）
 * @param {string} query
 * @param {'Latest'|'Top'} queryType
 */
async function searchTweets(query, queryType = 'Latest') {
  const all = [];
  const MAX_PAGES = 3;
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query: wrapQuery(query),
      queryType,
    });
    if (cursor) params.set('cursor', cursor);
    const url = `${TWITTER_API_BASE}/twitter/tweet/advanced_search?${params}`;
    const json = await safeFetchJSON(url, {
      timeout: 15000,
      headers: {
        'X-API-Key': config.twitter.apiKey,
        'Accept': 'application/json',
      },
    });
    const tweets = Array.isArray(json.tweets) ? json.tweets : [];
    all.push(...tweets);
    if (!json.has_next_page || !json.next_cursor) break;
    cursor = json.next_cursor;
  }
  return all;
}

/**
 * 单查询的容错包装
 */
async function safeQuery(query, queryType) {
  try {
    return await searchTweets(query, queryType);
  } catch (e) {
    console.warn(`[source:twitter] query="${query}" failed:`, e.message);
    return [];
  }
}

/**
 * 把用户的简单关键词包装成 Twitter 搜索语法：
 *   - 普通关键词用引号包裹，多词处理为 AND
 *   - 加上 filter 排除转发 / 引用 / 回复（即使是 from:xxx 也强制附加）
 *   - 加上 min_faves:50 min_retweets:10 作为粗筛（推文级别）
 *
 * 设计：无论用户写的是普通词还是 from:xxx，都强制附加转发过滤
 * （理由：白名单作者也可能转发别人，目标是抓"原作者发布的原创推文"）
 *
 * 注意：twitterapi.io 不一定完全支持 -filter:quote（推文级别过滤在 L3 兜底）
 */
function wrapQuery(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // 强制附加的转发/回复/引用过滤（针对抓取阶段 + L3 兜底）
  const noFwd = '-filter:retweets -filter:replies -filter:quote';
  // 已经是高级搜索操作符（如 from:xxx / since: / filter:）→ 追加过滤
  if (/[\s]*\b(from:|to:|since:|until:|filter:|lang:|near:|within:|min_faves:|min_retweets:)/.test(s)) {
    return `${s} ${noFwd}`;
  }
  // 普通关键词：加引号 + 过滤 + 互动量粗筛
  const quoted = s.split(/\s+/).filter(Boolean).map(w => `"${w}"`).join(' ');
  return `${quoted} ${noFwd} min_faves:50 min_retweets:10`;
}

function toItem(t) {
  const author = t.author || {};
  const handle = author.userName || '';
  const likes = t.likeCount || 0;
  const retweets = t.retweetCount || 0;
  const replies = t.replyCount || 0;
  const quotes = t.quoteCount || 0;
  const views = t.viewCount || 0;
  const text = t.text || '';
  // twitterapi.io 字段：retweeted_tweet / quoted_tweet（不是 retweetedStatus / quotedStatus）
  const isRetweet = !!(t.retweeted_tweet || t.isRetweet);
  const isQuote = !!(t.quoted_tweet || t.isQuote);
  const isReply = !!t.isReply;
  // 文本兜底：检测 "RT @xxx " 开头的纯转发（API 没标 isRetweet 时）
  const startsWithRt = /^RT\s+@/i.test(text);
  // 修复：转发和引用标记独立（不是同一种转发行为）
  return {
    title: text.slice(0, 200),
    url: t.url || `https://x.com/${handle}/status/${t.id}`,
    content: text,
    source_id: t.id ? String(t.id) : null,
    published_at: parseTwitterDate(t.createdAt),
    meta: {
      author: author.name || handle,
      handle,
      verified: !!author.isBlueVerified,
      isBlueVerified: !!author.isBlueVerified,
      isVerified: !!author.isVerified,
      followers: author.followers || 0,
      likes,
      retweets,
      replies,
      quotes,
      views,
      engagementRate: views > 0 ? Number(((likes + retweets + replies) / views).toFixed(4)) : 0,
      lang: t.lang || null,
      isReply,
      isRetweet,
      isQuote,
      startsWithRt,
      // 调试字段：上游 API 标记
      hasRetweetedTweet: !!t.retweeted_tweet,
      hasQuotedTweet: !!t.quoted_tweet,
      inReplyToId: t.inReplyToId || null,
      inReplyToUserId: t.inReplyToUserId || null,
      inReplyToUsername: t.inReplyToUsername || null,
      whitelisted: false,
    },
  };
}

function parseTwitterDate(s) {
  if (!s) return null;
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