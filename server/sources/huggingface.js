// HuggingFace: 最新模型 + 最新 papers
import { defineSource, safeFetchJSON } from './base.js';

const HF_MODELS = 'https://huggingface.co/api/models?sort=createdAt&direction=-1&filter=text-generation&limit=30';
const HF_PAPERS = 'https://huggingface.co/api/papers?sort=publishedAt&limit=30';

export function huggingface() {
  return defineSource('huggingface', async () => {
    const [models, papers] = await Promise.allSettled([
      safeFetchJSON(HF_MODELS, { timeout: 12000 }),
      safeFetchJSON(HF_PAPERS, { timeout: 12000 }),
    ]);
    const items = [];
    if (models.status === 'fulfilled' && Array.isArray(models.value)) {
      for (const m of models.value) {
        items.push({
          title: m.modelId || m.id || '(unnamed)',
          url: `https://huggingface.co/${m.modelId || m.id}`,
          content: (m.pipeline_tag || '') + (m.library_name ? ` · ${m.library_name}` : ''),
          source_id: m.modelId || m.id,
          published_at: m.createdAt ? new Date(m.createdAt).getTime() : null,
          meta: { kind: 'model', downloads: m.downloads || 0, likes: m.likes || 0 },
        });
      }
    }
    if (papers.status === 'fulfilled' && Array.isArray(papers.value)) {
      for (const p of papers.value) {
        items.push({
          title: p.title || '(no title)',
          url: p.url || `https://huggingface.co/papers/${p.id}`,
          content: (p.summary || '').slice(0, 800),
          source_id: p.id,
          published_at: p.publishedAt ? new Date(p.publishedAt).getTime() : null,
          meta: { kind: 'paper', upvotes: p.upvotes || 0 },
        });
      }
    }
    return items;
  }, { description: 'HuggingFace latest models + papers' });
}