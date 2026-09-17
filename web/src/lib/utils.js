import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * 数字紧凑格式：12345 → "12.3K", 1234567 → "1.2M"
 */
export function formatCount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0';
  const v = Number(n);
  if (v < 1000) return String(Math.floor(v));
  if (v < 10000) return `${(v / 1000).toFixed(1)}K`;
  if (v < 1000000) return `${Math.floor(v / 1000)}K`;
  if (v < 10000000) return `${(v / 1000000).toFixed(1)}M`;
  return `${Math.floor(v / 1000000)}M`;
}

/**
 * 综合质量分（用于"高质量优先"排序）
 * = importance * 0.7 + normalized_signal * 0.3
 * normalized_signal 取该源最强代理指标的对数归一化（0-1）
 */
export function qualityScore(h) {
  const imp = h.ai_importance ?? 0.5;
  const meta = h.meta || {};
  let raw = 0;
  switch (h.source) {
    case 'twitter':
      raw = Math.max(meta.views || 0, meta.likes || 0, meta.followers || 0);
      break;
    case 'bilibili':
      raw = Math.max(meta.plays || 0, meta.followers || 0);
      break;
    case 'github':
      raw = meta.stars || 0;
      break;
    case 'hackernews':
      raw = (meta.score || 0) * 5;
      break;
    case 'huggingface':
      raw = meta.downloads || 0;
      break;
    default:
      raw = 0;
  }
  // 对数归一化：log10(x+1) / log10(100000+1) → 0~1
  const norm = raw > 0 ? Math.min(1, Math.log10(raw + 1) / Math.log10(100000)) : 0;
  // 白名单加权
  const wlBonus = meta.whitelisted ? 0.05 : 0;
  return imp * 0.7 + norm * 0.3 + wlBonus;
}

export const SOURCE_LABELS = {
  hackernews: 'HackerNews',
  github: 'GitHub',
  huggingface: 'HuggingFace',
  arxiv: 'arXiv',
  twitter: 'X',
  bilibili: 'B站',
  google: 'Google News',
  'zhihu-trends': '知乎热搜',
  'weibo-trends': '微博热搜',
};

export const SOURCE_COLORS = {
  hackernews: 'from-orange-500/20 to-orange-600/10 text-orange-300 border-orange-500/30',
  github: 'from-slate-500/20 to-slate-600/10 text-slate-300 border-slate-500/30',
  huggingface: 'from-yellow-500/20 to-yellow-600/10 text-yellow-300 border-yellow-500/30',
  arxiv: 'from-rose-500/20 to-rose-600/10 text-rose-300 border-rose-500/30',
  twitter: 'from-sky-500/20 to-sky-600/10 text-sky-300 border-sky-500/30',
  bilibili: 'from-pink-500/20 to-pink-600/10 text-pink-300 border-pink-500/30',
  google: 'from-emerald-500/20 to-emerald-600/10 text-emerald-300 border-emerald-500/30',
  'zhihu-trends': 'from-blue-500/20 to-blue-600/10 text-blue-300 border-blue-500/30',
  'weibo-trends': 'from-red-500/20 to-red-600/10 text-red-300 border-red-500/30',
  account: 'from-pink-500/20 to-fuchsia-500/10 text-pink-200 border-pink-500/40',
};

/**
 * 解析来源 label/color：处理 account:bilibili:xxx / zhihu-trends / 普通源
 */
export function getSourceLabel(sourceKey) {
  if (!sourceKey) return '';
  if (sourceKey.startsWith('account:')) {
    const platform = sourceKey.split(':')[1];
    if (platform === 'bilibili') return 'B站账号';
    return `账号:${platform}`;
  }
  return SOURCE_LABELS[sourceKey] || sourceKey;
}

export function getSourceColor(sourceKey) {
  if (!sourceKey) return SOURCE_COLORS.twitter;
  if (sourceKey.startsWith('account:')) return SOURCE_COLORS.account;
  return SOURCE_COLORS[sourceKey] || SOURCE_COLORS.twitter;
}

/**
 * 判断是否为账号识别结果
 */
export function isAccountSource(sourceKey) {
  return typeof sourceKey === 'string' && sourceKey.startsWith('account:');
}

/**
 * 判断是否应该跳过 SourcePanel 心跳（隐藏动态账号源）
 */
export function isStableSource(sourceKey) {
  return !sourceKey?.startsWith('account:');
}