// 数据源注册中心 — 在这里添加/移除数据源
import { config } from '../config.js';
import { hackernews } from './hackernews.js';
import { github } from './github.js';
import { huggingface } from './huggingface.js';
import { arxiv } from './arxiv.js';
import { twitter } from './twitter.js';

let registry = [];

export function initSources() {
  registry = [];
  if (config.sources.hackernews) registry.push(hackernews());
  if (config.sources.github) registry.push(github());
  if (config.sources.huggingface) registry.push(huggingface());
  if (config.sources.arxiv) registry.push(arxiv());
  if (config.sources.twitter) registry.push(twitter());
  console.log(`[sources] registered: ${registry.map(s => s.name).join(', ') || '(none)'}`);
}

export function getAllSources() {
  return registry;
}