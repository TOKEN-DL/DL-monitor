// Debug: 验证 B站 抓取 + 过滤 的真实情况
//   - 不写 DB
//   - 直接调 B站 API，复用 quality.js 的过滤逻辑
//   - 打印：原始抓到多少 → 各过滤规则丢多少 → 存活多少
//
// 用法：node scripts/debug-bilibili.js

import 'dotenv/config';
import { config } from '../server/config.js';
import { safeFetchJSON } from '../server/sources/base.js';
import { filterBilibili } from '../server/sources/quality.js';

const BILI_SEARCH = 'https://api.bilibili.com/x/web-interface/search/all/v2';

const queries = config.bilibili.queries.slice(0, 5);
const minPlays = config.bilibili.minPlays;
const minFollowers = config.bilibili.minFollowers;
const windowHours = config.bilibili.windowHours;
const cutoff = Date.now() - windowHours * 3600 * 1000;

console.log('=== B站 抓取调试 ===');
console.log(`queries: ${JSON.stringify(queries)}`);
console.log(`SESSDATA: ${config.bilibili.sessdata ? '已配置' : '未配置（每日 100 次限额）'}`);
console.log(`minPlays=${minPlays}  minFollowers=${minFollowers}  windowHours=${windowHours}`);
console.log(`now=${new Date().toISOString()}  cutoff=${new Date(cutoff).toISOString()}\n`);

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Accept': 'application/json',
};
if (config.bilibili.sessdata) headers['Cookie'] = `SESSDATA=${config.bilibili.sessdata}`;

// ---------- 视频搜索 ----------
async function searchVideo(keyword) {
  const params = new URLSearchParams({
    keyword, search_type: 'video', order: 'pubdate',
    page: '1', pagesize: '30', platform: 'pc', web_location: '1550101',
  });
  const url = `${BILI_SEARCH}?${params}`;
  const json = await safeFetchJSON(url, { timeout: 15000, headers });
  if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.message}`);
  const result = json.data?.result || [];
  const videoResult = result.find(r => r.result_type === 'video');
  return Array.isArray(videoResult?.data) ? videoResult.data : [];
}

function toVideoItem(v) {
  if (!v || !v.bvid) return null;
  return {
    title: v.title?.replace(/<[^>]+>/g, '') || '',
    url: v.arcurl || `https://www.bilibili.com/video/${v.bvid}`,
    source_id: v.bvid,
    published_at: v.pubdate ? v.pubdate * 1000 : null,
    meta: {
      kind: 'video', is_up_master: false,
      author: v.author || '', mid: v.mid || null,
      followers: 0,    // 视频搜索 API 不直接给 UP 粉，需要另外查；这里用 0 模拟线上行为
      plays: v.play || 0,
      likes: v.like || 0, danmaku: v.danmaku || 0, favorites: v.favorite || 0,
      duration: v.duration || 0, tag: v.tag?.tag_name || '',
    },
  };
}

// ---------- UP主搜索 ----------
async function searchUPUser(keyword) {
  const params = new URLSearchParams({
    keyword, search_type: 'user',
    page: '1', pagesize: '10', platform: 'pc', web_location: '1550101',
  });
  const url = `${BILI_SEARCH}?${params}`;
  const json = await safeFetchJSON(url, { timeout: 15000, headers });
  if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.message}`);
  const result = json.data?.result || [];
  const upResult = result.find(r =>
    r.result_type === 'bili_user' || r.result_type === 'user' || r.result_type === 'upuser'
  );
  return Array.isArray(upResult?.data) ? upResult.data : [];
}

function toUPItem(u) {
  if (!u || !u.mid) return null;
  return {
    title: `👤 ${u.uname}`,
    url: `https://space.bilibili.com/${u.mid}`,
    source_id: `up-${u.mid}`,
    published_at: null,
    meta: {
      kind: 'up-master', is_up_master: true,
      author: u.uname, mid: u.mid, fans: u.fans || 0, followers: u.fans || 0,
      videos: u.videos || 0, level: u.level || 0,
    },
  };
}

// ---------- 主流程 ----------
async function main() {
  const allVideos = [];
  const allUPs = [];

  for (const q of queries) {
    process.stdout.write(`[fetch] video "${q}" ... `);
    try {
      const raw = await searchVideo(q);
      const items = raw.map(toVideoItem).filter(Boolean);
      console.log(`${raw.length} 原始 → ${items.length} 标准化`);
      allVideos.push(...items);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }

    process.stdout.write(`[fetch] user  "${q}" ... `);
    try {
      const raw = await searchUPUser(q);
      const items = raw.map(toUPItem).filter(Boolean);
      console.log(`${raw.length} 原始 → ${items.length} 标准化`);
      allUPs.push(...items);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }

  console.log(`\n=== 抓取汇总 ===`);
  console.log(`视频: ${allVideos.length} 条`);
  console.log(`UP主: ${allUPs.length} 条\n`);

  // ----- 视频过滤 -----
  console.log('=== 视频过滤（filterBilibili）===');
  if (allVideos.length === 0) {
    console.log('无视频可过滤\n');
  } else {
    // 看 6h 内有多少
    const inWindow = allVideos.filter(v => v.published_at && v.published_at >= cutoff).length;
    const playDist = allVideos.map(v => v.meta.plays).sort((a, b) => b - a);
    console.log(`视频播放量 top10: ${playDist.slice(0, 10).join(', ')}`);
    console.log(`6h 窗口内: ${inWindow}/${allVideos.length}`);
    const oldest = Math.min(...allVideos.filter(v => v.published_at).map(v => v.published_at));
    console.log(`最早一条时间: ${new Date(oldest).toISOString()}\n`);

    const { items: kept, dropped, stats } = filterBilibili(allVideos, {
      minPlays, minFollowers, windowHours,
    });
    console.log(`video filter: ${allVideos.length} → ${kept.length}`);
    console.log(`  byTime:      ${stats.byTime}    (发布时间不在 ${windowHours}h 内)`);
    console.log(`  byPlays:     ${stats.byPlays}    (播放量 < ${minPlays})`);
    console.log(`  byFollowers: ${stats.byFollowers}    (UP主粉丝 < ${minFollowers}; 视频搜索 API 不直接给粉，所以这里全 0 → 全数走这条)`);
    console.log(`  dropped:     ${dropped}`);
    if (kept.length > 0) {
      console.log(`\n存活的视频（前 5 条）：`);
      kept.slice(0, 5).forEach(v => {
        console.log(`  - [${v.meta.plays}播放] ${v.title} — ${v.meta.author}`);
      });
    }
  }

  // ----- UP主过滤 -----
  console.log('\n=== UP主过滤（粉丝阈值）===');
  if (allUPs.length === 0) {
    console.log('无 UP主可过滤');
  } else {
    const fansDist = allUPs.map(u => u.meta.fans).sort((a, b) => b - a);
    console.log(`UP主粉丝 top10: ${fansDist.slice(0, 10).join(', ')}`);
    const keptUPs = allUPs.filter(u => (u.meta.fans || 0) >= minFollowers);
    console.log(`UP filter: ${allUPs.length} → ${keptUPs.length} (粉丝 < ${minFollowers} 被丢 ${allUPs.length - keptUPs.length})`);
    if (keptUPs.length > 0) {
      console.log(`\n存活的 UP主：`);
      keptUPs.forEach(u => {
        console.log(`  - [${u.meta.fans}粉] ${u.meta.author}`);
      });
    }
  }

  console.log('\n=== 总结 ===');
  const totalKept = (allVideos.length === 0 ? 0 : filterBilibili(allVideos, { minPlays, minFollowers, windowHours }).items.length)
    + allUPs.filter(u => (u.meta.fans || 0) >= minFollowers).length;
  console.log(`最终能入库: ${totalKept} 条`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});