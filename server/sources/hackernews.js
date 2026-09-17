// HackerNews 抓取：Firebase API
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';
import { filterHackernews } from './quality.js';

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

export function hackernews() {
  return defineSource('hackernews', async () => {
    const ids = await safeFetchJSON(HN_TOP, { timeout: 10000 });
    if (!Array.isArray(ids)) return [];
    const top = ids.slice(0, 50);
    const results = await Promise.all(top.map(async (id) => {
      try {
        const item = await safeFetchJSON(HN_ITEM(id), { timeout: 8000 });
        if (!item || item.dead || item.deleted) return null;
        const url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
        return {
          title: item.title || '(no title)',
          url,
          content: item.text || (item.type === 'story' ? '' : ''),
          source_id: String(item.id),
          published_at: item.time ? item.time * 1000 : null,
          meta: {
            score: item.score || 0,
            descendants: item.descendants || 0,
            by: item.by || null,
            type: item.type,
          },
        };
      } catch { return null; }
    }));
    const filtered = results.filter(Boolean);
    const { items, stats } = filterHackernews(filtered, {
      ...config.thresholds.hackernews,
      windowHours: config.windows.hackernews,
    });
    if (filtered.length !== items.length) {
      console.log(`[source:hackernews] filter: ${filtered.length} → ${items.length} (score:${stats.byScore} descendants:${stats.byDescendants})`);
    }
    return items;
  }, { description: 'HackerNews Top Stories' });
}