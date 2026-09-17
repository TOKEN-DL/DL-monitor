import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v, d = false) => {
  if (v === undefined || v === null || v === '') return d;
  return String(v) === '1' || String(v).toLowerCase() === 'true';
};

export const config = {
  port: num(process.env.PORT, 3000),
  root: ROOT,
  dataDir: path.join(ROOT, 'data'),
  dbPath: path.join(ROOT, 'data', 'monitor.db'),
  publicDir: path.join(ROOT, 'public'),

  openrouter: {
    key: process.env.OPENROUTER_KEY || '',
    referer: process.env.OPENROUTER_REFERER || 'http://localhost:3000',
    title: process.env.OPENROUTER_TITLE || 'DL-monitor',
    classifyModel: process.env.OPENROUTER_CLASSIFY_MODEL || 'google/gemma-3-4b-it:free',
    summarizeModel: process.env.OPENROUTER_SUMMARIZE_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    enabled: !!process.env.OPENROUTER_KEY,
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
    to: process.env.MAIL_TO || '',
    enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_TO),
  },

  sources: {
    hackernews: bool(process.env.SOURCE_HACKERNEWS, true),
    github: bool(process.env.SOURCE_GITHUB, true),
    huggingface: bool(process.env.SOURCE_HUGGINGFACE, true),
    arxiv: bool(process.env.SOURCE_ARXIV, true),
    twitter: bool(process.env.SOURCE_TWITTER, false),
    bilibili: bool(process.env.SOURCE_BILIBILI, false),
    google: bool(process.env.SOURCE_GOOGLE, false),
    zhihuTrends: bool(process.env.SOURCE_ZHIHU_TRENDS, true),
    weiboTrends: bool(process.env.SOURCE_WEIBO_TRENDS, false),
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    queries: (process.env.TWITTER_QUERIES || '').split(',').map(s => s.trim()).filter(Boolean),
    minFollowers: num(process.env.TWITTER_MIN_FOLLOWERS, 5000),
    minViews: num(process.env.TWITTER_MIN_VIEWS, 2000),
    windowHours: num(process.env.WINDOW_TWITTER, 6),
  },

  bilibili: {
    sessdata: process.env.BILIBILI_SESSDATA || '',
    queries: (process.env.BILIBILI_QUERIES || '').split(',').map(s => s.trim()).filter(Boolean),
    minPlays: num(process.env.BILIBILI_MIN_PLAYS, 2000),
    minFollowers: num(process.env.BILIBILI_MIN_FOLLOWERS, 5000),
    windowHours: num(process.env.WINDOW_BILIBILI, 6),
  },

  google: {
    queries: (process.env.GOOGLE_QUERIES || '').split(',').map(s => s.trim()).filter(Boolean),
    windowHours: num(process.env.WINDOW_GOOGLE, 6),
  },

  // 各老源的代理指标阈值（按用户决策：每源走独立代理指标）
  thresholds: {
    hackernews: { minScore: num(process.env.HN_MIN_SCORE, 50), minDescendants: num(process.env.HN_MIN_DESCENDANTS, 20) },
    github: { minStars: num(process.env.GITHUB_MIN_STARS, 200) },
    huggingface: { minDownloads: num(process.env.HF_MIN_DOWNLOADS, 1000) },
    // arXiv 无浏览量，单独配置时间窗
    arxiv: {},
  },

  windows: {
    hackernews: num(process.env.WINDOW_HACKERNEWS, 24),
    github: num(process.env.WINDOW_GITHUB, 24),
    huggingface: num(process.env.WINDOW_HUGGINGFACE, 168),
    arxiv: num(process.env.WINDOW_ARXIV, 168),
  },

  cron: {
    hackernews: process.env.CRON_HACKERNEWS || '*/10 * * * *',
    github: process.env.CRON_GITHUB || '*/30 * * * *',
    huggingface: process.env.CRON_HUGGINGFACE || '*/30 * * * *',
    arxiv: process.env.CRON_ARXIV || '0 */1 * * *',
    twitter: process.env.CRON_TWITTER || '*/15 * * * *',
    bilibili: process.env.CRON_BILIBILI || '*/15 * * * *',
    google: process.env.CRON_GOOGLE || '*/30 * * * *',
    'zhihu-trends': process.env.CRON_ZHIHU_TRENDS || '*/15 * * * *',
    'weibo-trends': process.env.CRON_WEIBO_TRENDS || '0 */1 * * *',
    accountResolve: process.env.CRON_ACCOUNT_RESOLVE || '7 * * * *',
    retention: process.env.CRON_RETENTION || '37 3 * * *',  // 每天 03:37
  },

  // 信息保留策略：3-tier retention
  // - 活跃（前端显示）：fetched_at 在 windowDays 内
  // - 归档（隐藏但保留）：fetched_at > windowDays 且 views >= archiveViews
  // - 删除：fetched_at > windowDays 且 views < archiveViews（白名单豁免）
  // 归档阈值参考：@OpenAI GPT-5 / @AnthropicAI Claude 4 发布推文 3M+ 浏览量；
  // KOL 反应推文 100K-1M；故 100K (10万) 作为"重要模型发布相关"基准
  retention: {
    enabled: bool(process.env.RETENTION_ENABLED, true),
    windowDays: num(process.env.RETENTION_WINDOW_DAYS, 7),
    archiveViews: num(process.env.RETENTION_ARCHIVE_VIEWS, 100000),
  },

  // 前端显示阈值（默认过滤低重要度条目）
  // - minImportance: 最低 AI 重要度（0-1）；NULL 的条目（未评分）放行
  display: {
    minImportance: num(process.env.DISPLAY_MIN_IMPORTANCE, 0.5),
  },

  tz: 'Asia/Shanghai',
};