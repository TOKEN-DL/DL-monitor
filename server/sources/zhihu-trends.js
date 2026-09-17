// 知乎实时热搜词源（仅关键词，作为"今日热议"信号）
// 端点：https://www.zhihu.com/api/v4/search/top_search
// 用途：
//   - 公共 API，无鉴权，国内可达
//   - 仅返回热搜词列表，无文章详情链接
//   - 用户关键词命中热搜词 → AI 分析时 importance 加成
//   - 每条 source_id 用 uuid，保证 30 个热搜词各自去重
import { defineSource, safeFetchJSON } from './base.js';

const ZHIHU_TRENDS = 'https://www.zhihu.com/api/v4/search/top_search';
const TRENDS_PARAMS = new URLSearchParams({
  app_code: 'MobileWeb',
  app_version: '2.0.0',
  app_build: '210',
  platform: 'MobileWeb',
  version_code: '2.0.0',
  pc_client_type: '2',
  cookie_enabled: 'true',
  timezone_offset: '-480',
  cursor: '',
  limit: '50',
}).toString();

export function zhihuTrends() {
  return defineSource('zhihu-trends', async () => {
    const url = `${ZHIHU_TRENDS}?${TRENDS_PARAMS}`;
    const json = await safeFetchJSON(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const words = Array.isArray(json?.top_search?.words) ? json.top_search.words : [];
    return words.slice(0, 30).map((w, i) => ({
      title: `#${i + 1} ${w.display_query || w.query}`,
      url: `https://www.zhihu.com/search?q=${encodeURIComponent(w.query)}&type=content`,
      content: '知乎实时热搜词',
      source_id: `zhihu-trend-${w.uuid || w.query}`,
      published_at: Date.now(),
      meta: {
        type: 'trend-keyword',
        platform: 'zhihu',
        rank: i + 1,
        query: w.query,
        display_query: w.display_query,
      },
    }));
  }, { description: '知乎热搜词列表（仅关键词，作为今日热议信号）' });
}