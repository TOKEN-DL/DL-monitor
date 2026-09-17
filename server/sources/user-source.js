// 通用网页爬虫：用户新增信息源的默认 fetcher
// 策略：RSS 自动发现 → RSS 解析 → HTML 标题抓取（降级）
import { defineSource, safeFetchText } from './base.js';
import { sourcesRepo } from '../db.js';

export { discoverRSS, parseRSS, parseHTMLHeadlines };

/**
 * 内置源的展示名（避免与 sources/index.js 形成循环依赖）
 */
export const BUILTIN_SOURCE_LABELS = {
  hackernews: 'HackerNews',
  github: 'GitHub',
  huggingface: 'HuggingFace',
  arxiv: 'arXiv',
  twitter: 'X(Twitter)',
  bilibili: 'B站',
  google: 'Google News',
  'zhihu-trends': '知乎热搜',
  'weibo-trends': '微博热搜',
};

/**
 * 单次抓取（不注册为 Source，供 API 测试 / 手动触发用）
 * @param {string} name 源 ID（必须是已存在的 user 源）
 * @returns {Promise<Array>} items
 */
export async function fetchUserSourceOnce(name) {
  const src = createUserSource(name);
  return src.fetch();
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/**
 * 创建用户源运行时实例（DB 驱动）
 * @param {string} name - 源 ID（如 'user:abc-news'）
 */
export function createUserSource(name) {
  const meta = sourcesRepo.get(name);
  const description = `用户源 ${meta?.label || name}`;
  return defineSource(name, async () => {
    const row = sourcesRepo.get(name);
    if (!row) return [];
    let cfg = {};
    try { cfg = row.config ? JSON.parse(row.config) : {}; } catch { cfg = {}; }
    const url = cfg.url;
    if (!url) return [];

    // 1) 尝试 RSS 自动发现
    let items = [];
    try {
      const rssUrl = await discoverRSS(url);
      if (rssUrl) {
        items = await parseRSS(rssUrl, name);
        if (items.length) return items;
      }
    } catch (e) {
      console.warn(`[user-source:${name}] RSS autodiscovery failed:`, e.message);
    }

    // 2) 降级到 HTML 标题抓取
    try {
      items = await parseHTMLHeadlines(url, name);
    } catch (e) {
      console.warn(`[user-source:${name}] HTML scrape failed:`, e.message);
    }
    return items;
  }, { description });
}

/**
 * 抓取 HTML，查找 <link rel="alternate" type="application/rss+xml|atom+xml" href="...">
 * @returns {string|null} 候选 RSS URL（相对路径转绝对）
 */
async function discoverRSS(url) {
  const html = await safeFetchText(url, { timeout: 15000, headers: DEFAULT_HEADERS });
  // 抓 RSS / Atom 链接
  const re = /<link[^>]+(?:rel=["'](?:alternate|feed)["'])[^>]+(?:type=["'](?:application\/(?:rss|atom)\+xml|application\/xml)["'])[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    if (!href) continue;
    if (href.startsWith('//')) href = 'https:' + href;
    else if (href.startsWith('/')) {
      const u = new URL(url);
      href = `${u.protocol}//${u.host}${href}`;
    } else if (!/^https?:/i.test(href)) {
      const u = new URL(url);
      href = `${u.protocol}//${u.host}/${href.replace(/^\//, '')}`;
    }
    return href;
  }
  // 常见约定：直接尝试 /feed /rss /atom.xml
  try {
    const u = new URL(url);
    const candidates = ['/feed', '/rss', '/rss.xml', '/atom.xml', '/feed.xml'];
    for (const c of candidates) {
      try {
        const r = await fetch(u.origin + c, { method: 'HEAD', headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(5000) });
        if (r.ok && /xml|rss|atom/i.test(r.headers.get('content-type') || '')) {
          return u.origin + c;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * 极简 RSS/Atom 解析器（仅取 title + link + pubDate/updated）
 * 不引入第三方 XML 库，使用正则提取，避免 cheerio 依赖
 */
async function parseRSS(feedUrl, name) {
  const xml = await safeFetchText(feedUrl, { timeout: 15000, headers: DEFAULT_HEADERS });
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  if (isAtom) {
    // Atom: <entry><title>...</title><link href="..."/><published>...</published></entry>
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    let m;
    let i = 0;
    while ((m = entryRe.exec(xml)) !== null && items.length < 20) {
      const body = m[1];
      const title = stripTags(extractTag(body, 'title')) || '(无标题)';
      let link = extractAttr(body, 'link', 'href');
      if (!link) {
        const linkBlock = body.match(/<link\b[^>]*?(?:href=["']([^"']+)["']|\/>)/i);
        if (linkBlock) link = linkBlock[1] || null;
      }
      const pub = parseDate(extractTag(body, 'published') || extractTag(body, 'updated'));
      if (link) {
        items.push({
          title: title.slice(0, 500),
          url: link,
          content: '',
          source_id: `${name}:${++i}:${link}`,
          published_at: pub,
          meta: { type: 'rss-item', feed: feedUrl },
        });
      }
    }
  } else {
    // RSS 2.0 / RDF: <item><title>...</title><link>...</link><pubDate>...</pubDate></item>
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let m;
    let i = 0;
    while ((m = itemRe.exec(xml)) !== null && items.length < 20) {
      const body = m[1];
      const title = stripTags(extractTag(body, 'title')) || '(无标题)';
      const link = extractTag(body, 'link') || extractTag(body, 'guid');
      const pub = parseDate(extractTag(body, 'pubDate') || extractTag(body, 'dc:date'));
      if (link) {
        items.push({
          title: title.slice(0, 500),
          url: link.trim(),
          content: stripTags(extractTag(body, 'description') || '').slice(0, 5000),
          source_id: `${name}:${++i}:${link.trim()}`,
          published_at: pub,
          meta: { type: 'rss-item', feed: feedUrl },
        });
      }
    }
  }
  return items;
}

/**
 * HTML 标题抓取降级方案
 * 多策略组合：<article> 块 → <h2>/<h3> 链接 → 列表项链接 → <title> 兜底
 * 限制最多 15 条
 */
async function parseHTMLHeadlines(url, name) {
  const html = await safeFetchText(url, { timeout: 15000, headers: DEFAULT_HEADERS });
  const baseUrl = (() => { try { const u = new URL(url); return u; } catch { return null; } })();
  const items = [];
  const seen = new Set();

  function pushItem(title, href, content) {
    if (!title || !href) return;
    // 过滤非正文链接：导航、js、锚点
    if (/^(javascript:|mailto:|#|\?)/i.test(href)) return;
    let full = href;
    if (baseUrl) {
      try { full = new URL(href, baseUrl).href; } catch { return; }
    }
    if (seen.has(full) || full === url) return;
    seen.add(full);
    if (items.length >= 15) return;
    items.push({
      title: title.slice(0, 500),
      url: full,
      content: (content || '').slice(0, 5000),
      source_id: `${name}:${items.length + 1}:${full}`,
      published_at: null,
      meta: { type: 'html-scrape', page: url },
    });
  }

  // 策略 1: <article> 块内的链接（最干净）
  const articleRe = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null && items.length < 10) {
    const block = m[1];
    const aRe = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let am;
    while ((am = aRe.exec(block)) !== null && items.length < 10) {
      const title = stripTags(am[2]).trim();
      if (title.length >= 6) pushItem(title, am[1], '');
    }
  }

  // 策略 2: <h2>/<h3> 带链接（标题-链接对，最常见模式）
  if (items.length < 8) {
    const hRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
    while ((m = hRe.exec(html)) !== null && items.length < 12) {
      const inner = m[1];
      const aMatch = inner.match(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (aMatch) {
        const title = stripTags(aMatch[2]).trim();
        if (title.length >= 6) pushItem(title, aMatch[1], '');
      } else {
        const title = stripTags(inner).trim();
        if (title.length >= 6) pushItem(title, url, '');
      }
    }
  }

  // 策略 3: 列表项内的链接（<li>...<a>标题</a>...</li>）
  if (items.length < 8) {
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    while ((m = liRe.exec(html)) !== null && items.length < 12) {
      const li = m[1];
      // 只关心含标题长度的链接
      const aMatch = li.match(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) continue;
      const title = stripTags(aMatch[2]).trim();
      if (title.length < 8 || title.length > 120) continue;
      // 排除纯导航类
      if (/^(首页|登录|注册|更多|查看|更多|关于|联系)/.test(title)) continue;
      pushItem(title, aMatch[1], '');
    }
  }

  // 策略 4: <title> 兜底
  if (items.length === 0) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      pushItem(stripTags(titleMatch[1]).trim(), url, '');
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*?${attr}=["']([^"']+)["']`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function stripTags(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
