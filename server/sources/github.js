// GitHub Trending：使用 GitHub Search API（GitHub trending 页面是 React SPA，HTML 无数据）
import { defineSource, safeFetchJSON } from './base.js';

// 计算 "N 天前" 的 ISO 日期
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// 综合排序：找近期被广泛 star 的仓库（即"trending" 的近似）
async function searchRepos({ since, label }) {
  const url = `https://api.github.com/search/repositories?q=stars:>300+pushed:>${daysAgo(since)}&sort=stars&order=desc&per_page=20`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DL-monitor/0.1',
  };
  // 可选 GITHUB_TOKEN：认证后 search 端点限流从 10/min 提升到 30/min
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const json = await safeFetchJSON(url, { timeout: 15000, headers });
  return (json.items || []).map(r => ({
    title: r.full_name,
    url: r.html_url,
    content: r.description || '',
    source_id: String(r.id),
    published_at: r.pushed_at ? new Date(r.pushed_at).getTime() : (r.created_at ? new Date(r.created_at).getTime() : null),
    meta: {
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: r.topics || [],
      range: label,
    },
  }));
}

export function github() {
  return defineSource('github', async () => {
    const [daily, weekly] = await Promise.allSettled([
      searchRepos({ since: 1, label: 'daily' }),
      searchRepos({ since: 7, label: 'weekly' }),
    ]);
    const items = [];
    if (daily.status === 'fulfilled') items.push(...daily.value);
    if (weekly.status === 'fulfilled') items.push(...weekly.value);
    const seen = new Set();
    return items.filter(it => {
      if (seen.has(it.url)) return false;
      seen.add(it.url);
      return true;
    });
  }, { description: 'GitHub Trending via Search API' });
}