// Debug: 把窗口放宽到 7 天，看 byFollowers 是否会开始杀人
import 'dotenv/config';
import { config } from '../server/config.js';
import { safeFetchJSON } from '../server/sources/base.js';
import { filterBilibili } from '../server/sources/quality.js';

const BILI_SEARCH = 'https://api.bilibili.com/x/web-interface/search/all/v2';
const queries = config.bilibili.queries.slice(0, 5);
const minFollowers = config.bilibili.minFollowers;

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Accept': 'application/json',
};

async function searchVideo(keyword) {
  const params = new URLSearchParams({
    keyword, search_type: 'video', order: 'pubdate',
    page: '1', pagesize: '30', platform: 'pc', web_location: '1550101',
  });
  const json = await safeFetchJSON(`${BILI_SEARCH}?${params}`, { timeout: 15000, headers });
  const result = json.data?.result || [];
  return (result.find(r => r.result_type === 'video')?.data || []);
}

function toVideoItem(v) {
  if (!v || !v.bvid) return null;
  return {
    published_at: v.pubdate ? v.pubdate * 1000 : null,
    meta: { plays: v.play || 0, followers: 0, author: v.author || '', mid: v.mid || null },
  };
}

const allVideos = [];
for (const q of queries) {
  try { allVideos.push(...(await searchVideo(q)).map(toVideoItem).filter(Boolean)); }
  catch (e) { console.log(`FAIL ${q}: ${e.message}`); }
}
console.log(`视频总数: ${allVideos.length}\n`);

for (const windowHours of [6, 24, 72, 168, 720]) {
  const { items, dropped, stats } = filterBilibili(allVideos, {
    minPlays: config.bilibili.minPlays,
    minFollowers,
    windowHours,
  });
  console.log(
    `window=${windowHours}h  ${allVideos.length} → ${items.length}  ` +
    `(byTime=${stats.byTime}  byPlays=${stats.byPlays}  byFollowers=${stats.byFollowers})`
  );
}

console.log(`\n最后改一下：把 minFollowers 设为 0 看看到底会不会有视频留下来`);
for (const minF of [0, 1000, 5000]) {
  const { items } = filterBilibili(allVideos, {
    minPlays: config.bilibili.minPlays,
    minFollowers: minF,
    windowHours: 168,
  });
  console.log(`minFollowers=${minF}  window=168h  →  ${items.length} 条`);
}