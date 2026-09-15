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
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    queries: (process.env.TWITTER_QUERIES || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  cron: {
    hackernews: process.env.CRON_HACKERNEWS || '*/10 * * * *',
    github: process.env.CRON_GITHUB || '*/30 * * * *',
    huggingface: process.env.CRON_HUGGINGFACE || '*/30 * * * *',
    arxiv: process.env.CRON_ARXIV || '0 */1 * * *',
    twitter: process.env.CRON_TWITTER || '*/20 * * * *',
  },

  tz: 'Asia/Shanghai',
};