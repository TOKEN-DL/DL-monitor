// B站 数据源：按关键词搜索视频 + UP主（双类型）
//   - 视频端点：api.bilibili.com/x/web-interface/search/all/v2?search_type=video
//   - UP主端点：api.bilibili.com/x/web-interface/search/all/v2?search_type=user
//   - 可选 SESSDATA cookie 提高搜索限额
//   - 过滤：
//     * 视频：播放量 ≥ minPlays + UP主粉丝 ≥ minFollowers + 6h 时间窗
//     * UP主：粉丝 ≥ minFollowers（无时间窗）
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';
import { filterBilibili } from './quality.js';

const BILI_SEARCH = 'https://api.bilibili.com/x/web-interface/search/all/v2';

export function bilibili() {
  return defineSource('bilibili', async () => {
    const queries = config.bilibili.queries;
    if (!queries.length) {
      console.warn('[source:bilibili] BILIBILI_QUERIES empty, skip');
      return [];
    }

    const limitedQueries = queries.slice(0, 5);
    // 每个关键词并行发起视频 + UP主 两个请求
    const tasks = limitedQueries.flatMap(q => [
      safeSearchVideo(q),
      safeSearchUPUser(q),
    ]);
    const settled = await Promise.allSettled(tasks);

    const all = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        all.push(...r.value);
      } else {
        const q = limitedQueries[Math.floor(i / 2)];
        const kind = i % 2 === 0 ? 'video' : 'user';
        console.warn(`[source:bilibili] q="${q}" ${kind} failed:`, r.reason?.message);
      }
    });

    // 拆分视频与 UP主，分别走不同过滤逻辑
    const videos = all.filter(it => !it.meta?.is_up_master);
    const ups = all.filter(it => it.meta?.is_up_master === true);

    const beforeV = videos.length;
    const { items: videosFiltered, dropped: dv, stats } = filterBilibili(videos, {
      minPlays: config.bilibili.minPlays,
      minFollowers: config.bilibili.minFollowers,
      windowHours: config.bilibili.windowHours,
    });
    if (dv > 0) {
      console.log(
        `[source:bilibili] video filter: ${beforeV} → ${videosFiltered.length} ` +
        `(time:${stats.byTime} plays<${config.bilibili.minPlays}:${stats.byPlays} ` +
        `followers<${config.bilibili.minFollowers}:${stats.byFollowers})`
      );
    }

    // UP主过滤：仅粉丝阈值（无时间窗/播放量）
    const beforeU = ups.length;
    const upsFiltered = ups.filter(u => (u.meta?.fans || 0) >= config.bilibili.minFollowers);
    if (beforeU !== upsFiltered.length) {
      console.log(
        `[source:bilibili] UP filter: ${beforeU} → ${upsFiltered.length} ` +
        `(fans<${config.bilibili.minFollowers})`
      );
    }

    return [...videosFiltered, ...upsFiltered];
  }, { description: 'B站 视频 + UP主搜索（双类型）' });
}

// ---------------- 视频搜索 ----------------
async function safeSearchVideo(keyword) {
  const params = new URLSearchParams({
    keyword,
    search_type: 'video',
    order: 'pubdate',
    page: '1',
    pagesize: '30',
    platform: 'pc',
    web_location: '1550101',
  });
  const url = `${BILI_SEARCH}?${params}`;
  const json = await safeFetchJSON(url, { timeout: 15000, headers: biliHeaders() });

  if (json.code !== 0) {
    throw new Error(`bilibili-video code=${json.code} msg=${json.message || 'unknown'}`);
  }

  const result = json.data?.result || [];
  const videoResult = result.find(r => r.result_type === 'video');
  const vlist = Array.isArray(videoResult?.data) ? videoResult.data : [];

  return vlist.map(toVideoItem).filter(Boolean);
}

function toVideoItem(v) {
  if (!v || !v.bvid) return null;
  const stat = {
    view: v.play || 0,
    danmaku: v.danmaku || 0,
    like: v.like || 0,
    favorite: v.favorite || 0,
    coin: v.coin || 0,
    share: v.share || 0,
    reply: v.reply || 0,
    duration: v.duration || 0,
  };
  return {
    title: stripHtml(v.title || ''),
    url: v.arcurl || `https://www.bilibili.com/video/${v.bvid}`,
    content: stripHtml(v.description || '').slice(0, 800),
    source_id: v.bvid,
    published_at: v.pubdate ? v.pubdate * 1000 : null,
    meta: {
      kind: 'video',
      is_up_master: false,
      author: v.author || '',
      mid: v.mid || null,
      followers: 0,
      plays: stat.view,
      danmaku: stat.danmaku,
      likes: stat.like,
      favorites: stat.favorite,
      coins: stat.coin,
      shares: stat.share,
      comments: stat.reply,
      duration: stat.duration,
      tag: v.tag?.tag_name || '',
      bvid: v.bvid,
      aid: v.aid,
    },
  };
}

// ---------------- UP主搜索 ----------------
async function safeSearchUPUser(keyword) {
  const params = new URLSearchParams({
    keyword,
    search_type: 'user',
    page: '1',
    pagesize: '10',
    platform: 'pc',
    web_location: '1550101',
  });
  const url = `${BILI_SEARCH}?${params}`;
  const json = await safeFetchJSON(url, { timeout: 15000, headers: biliHeaders() });

  if (json.code !== 0) {
    throw new Error(`bilibili-user code=${json.code} msg=${json.message || 'unknown'}`);
  }

  const result = json.data?.result || [];
  // B站实际返回 result_type='bili_user'；兼容 'user' 和 'upuser'
  const upResult = result.find(r =>
    r.result_type === 'bili_user' ||
    r.result_type === 'user' ||
    r.result_type === 'upuser'
  );
  const ulist = Array.isArray(upResult?.data) ? upResult.data : [];

  return ulist.map(toUPItem).filter(Boolean);
}

function toUPItem(u) {
  if (!u || !u.mid) return null;
  return {
    title: `👤 ${u.uname}`,
    url: `https://space.bilibili.com/${u.mid}`,
    content: (u.usign || u.official_desc || '').slice(0, 500),
    source_id: `up-${u.mid}`,
    published_at: null,
    meta: {
      kind: 'up-master',
      is_up_master: true,
      author: u.uname,
      mid: u.mid,
      name: u.uname,
      fans: u.fans || 0,
      followers: u.fans || 0,
      videos: u.videos || 0,
      sign: u.usign || '',
      face: u.upic || '',
      level: u.level || 0,
      official_desc: u.official_desc || '',
    },
  };
}

// ---------------- 通用 ----------------
function biliHeaders() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json',
  };
  if (config.bilibili.sessdata) {
    headers['Cookie'] = `SESSDATA=${config.bilibili.sessdata}`;
  }
  return headers;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}