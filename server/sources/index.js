// 数据源注册中心：内置源 + 用户源（DB 驱动）
import { config } from '../config.js';
import { sourcesRepo } from '../db.js';
import { hackernews } from './hackernews.js';
import { github } from './github.js';
import { huggingface } from './huggingface.js';
import { arxiv } from './arxiv.js';
import { twitter } from './twitter.js';
import { bilibili } from './bilibili.js';
import { google } from './google.js';
import { zhihuTrends } from './zhihu-trends.js';
import { weiboTrends } from './weibo-trends.js';
import { createUserSource } from './user-source.js';

let registry = [];

// 内置源定义（name + label + factory）
const BUILTINS = [
  { name: 'hackernews', label: 'HackerNews', factory: hackernews },
  { name: 'github', label: 'GitHub', factory: github },
  { name: 'huggingface', label: 'HuggingFace', factory: huggingface },
  { name: 'arxiv', label: 'arXiv', factory: arxiv },
  { name: 'twitter', label: 'X(Twitter)', factory: twitter },
  { name: 'bilibili', label: 'B站', factory: bilibili },
  { name: 'google', label: 'Google News', factory: google },
  { name: 'zhihu-trends', label: '知乎热搜', factory: zhihuTrends },
  { name: 'weibo-trends', label: '微博热搜', factory: weiboTrends },
];

/**
 * 重新构建 registry：
 * 1. seed 内置源到 DB（INSERT OR IGNORE，保留用户对 enabled 的修改）
 * 2. 按 DB 状态合并：内置源读 DB 的 enabled 标志，用户源从 DB 拿配置
 * 3. .env 的 SOURCE_* 仅控制"是否 seed 为默认 enabled"，用户可在 UI 切换
 */
export function initSources() {
  registry = [];

  // Step 1: seed builtins
  const seedList = BUILTINS.map((b) => ({
    name: b.name,
    label: b.label,
    defaultEnabled: !!config.sources[b.name === 'zhihu-trends' ? 'zhihuTrends' : b.name === 'weibo-trends' ? 'weiboTrends' : b.name],
  }));
  sourcesRepo.seedBuiltins(seedList);

  // Step 2: build registry from DB
  const allSources = sourcesRepo.list();
  const dbMap = new Map(allSources.map((s) => [s.name, s]));

  for (const b of BUILTINS) {
    const row = dbMap.get(b.name);
    if (!row) continue;
    if (!row.enabled) continue; // DB 关掉的不进 registry（不抓取）
    registry.push(b.factory());
  }

  // 用户源：所有 enabled=1 的用户源都进 registry
  for (const s of allSources) {
    if (s.kind !== 'user' || !s.enabled) continue;
    registry.push(createUserSource(s.name));
  }

  console.log(`[sources] registered (${registry.length}):`, registry.map((s) => s.name).join(', ') || '(none)');
}

export function getAllSources() {
  return registry;
}

/**
 * 给 scheduler / API 用：拿到一个 source row（任意 kind）
 */
export function getSourceMeta(name) {
  return sourcesRepo.get(name);
}
