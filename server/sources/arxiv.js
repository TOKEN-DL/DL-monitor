// arXiv: cs.AI / cs.CL / cs.LG 最新论文
import * as cheerio from 'cheerio';
import { defineSource, safeFetchText } from './base.js';

const ARXIV_URL = 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=30';

export function arxiv() {
  return defineSource('arxiv', async () => {
    // arXiv 偶发 429，加重试 + 间隔
    let xml;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        xml = await safeFetchText(ARXIV_URL, {
          timeout: 20000,
          headers: { 'User-Agent': 'DL-monitor/0.1 (mailto:dev@example.com)' },
        });
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[source:arxiv] attempt ${attempt + 1} failed:`, e.message);
        await new Promise(r => setTimeout(r, (attempt + 1) * 4000));
      }
    }
    if (!xml) throw lastErr;
    const $ = cheerio.load(xml, { xmlMode: true });
    const items = [];
    $('entry').each((_, el) => {
      const $e = $(el);
      const id = $e.find('id').text().trim().split('/').pop();
      const title = $e.find('title').text().trim().replace(/\s+/g, ' ');
      const summary = $e.find('summary').text().trim().replace(/\s+/g, ' ').slice(0, 800);
      const link = $e.find('link[rel="alternate"]').attr('href') || `https://arxiv.org/abs/${id}`;
      const published = $e.find('published').text().trim();
      items.push({
        title,
        url: link,
        content: summary,
        source_id: id,
        published_at: published ? new Date(published).getTime() : null,
        meta: {
          authors: $e.find('author name').map((_, a) => $(a).text()).get().slice(0, 5),
          categories: $e.find('category').map((_, c) => $(c).attr('term')).get().slice(0, 3),
        },
      });
    });
    return items;
  }, { description: 'arXiv cs.AI / cs.CL / cs.LG' });
}