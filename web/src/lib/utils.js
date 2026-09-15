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

export const SOURCE_LABELS = {
  hackernews: 'HackerNews',
  github: 'GitHub',
  huggingface: 'HuggingFace',
  arxiv: 'arXiv',
  twitter: 'X',
};

export const SOURCE_COLORS = {
  hackernews: 'from-orange-500/20 to-orange-600/10 text-orange-300 border-orange-500/30',
  github: 'from-slate-500/20 to-slate-600/10 text-slate-300 border-slate-500/30',
  huggingface: 'from-yellow-500/20 to-yellow-600/10 text-yellow-300 border-yellow-500/30',
  arxiv: 'from-rose-500/20 to-rose-600/10 text-rose-300 border-rose-500/30',
  twitter: 'from-sky-500/20 to-sky-600/10 text-sky-300 border-sky-500/30',
};