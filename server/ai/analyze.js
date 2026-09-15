// AI 分析：先用小模型分类，再用大模型摘要
import { config } from '../config.js';
import { chatCompletion, extractJSON } from './openrouter.js';
import { aiCache, hashContent, keywordsRepo } from '../db.js';

const CLASSIFY_SYSTEM = `你是 AI 编程博主的助理。给定一段内容，判断它是否与用户的关键词列表相关，并评估其重要性（0-1）。
请严格返回 JSON，不要任何其他文字。
返回格式：
{"score": 0.0-1.0, "importance": 0.0-1.0, "matched_keywords": ["关键词1","关键词2"], "reason": "一句话中文解释"}
- score: 严格相关度，0=无关，1=直接讲关键词
- importance: 综合重要性，考虑内容时效性、影响范围、是否为新发布/更新
- matched_keywords: 命中的关键词子集（可为空）`;

const SUMMARIZE_SYSTEM = `你是 AI 领域资深博主，给定一段内容，写一句中文摘要（30-80字），让读者一眼明白发生了什么。
要求：客观、简洁、不要 Markdown、不要引号、不要"标题："等前缀。如果内容不是中文圈事件，用中文翻译关键信息。`;

export async function analyzeItem(item) {
  const hash = hashContent(item.url);
  const cached = aiCache.get(hash);
  if (cached && cached.created_at > Date.now() - 24 * 3600 * 1000) {
    return {
      score: cached.score,
      importance: cached.importance,
      summary: cached.summary,
      matched_keywords: cached.matched_keywords ? JSON.parse(cached.matched_keywords) : [],
      cached: true,
    };
  }
  const kws = keywordsRepo.enabled().map(k => k.text);
  if (!kws.length) {
    // 没有关键词就跳过相关性分析，但仍生成摘要
    return { score: 0.5, importance: 0.5, summary: null, matched_keywords: [] };
  }

  // 1) 分类（相关性 + 重要性）
  const userMsg = `关键词列表：${kws.join('、')}
\n来源：${item.source}
\n标题：${item.title}
\n内容：${(item.content || '').slice(0, 600)}
\n请输出 JSON。`;

  let score = 0, importance = 0.5, matched_keywords = [];
  try {
    const { content } = await chatCompletion({
      model: config.openrouter.classifyModel,
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.1,
      max_tokens: 200,
      json: true,
      timeout: 30000,
    });
    const parsed = extractJSON(content);
    if (parsed) {
      score = clamp01(parsed.score);
      importance = clamp01(parsed.importance);
      matched_keywords = Array.isArray(parsed.matched_keywords)
        ? parsed.matched_keywords.filter(x => kws.includes(x))
        : [];
    }
  } catch (e) {
    console.warn('[ai:classify] failed', e.message);
    score = 0;
  }

  // 2) 仅当相关性超过阈值才生成摘要（节省 token）
  let summary = null;
  if (score >= 0.4) {
    try {
      const { content } = await chatCompletion({
        model: config.openrouter.summarizeModel,
        messages: [
          { role: 'system', content: SUMMARIZE_SYSTEM },
          { role: 'user', content: `标题：${item.title}\n内容：${(item.content || '').slice(0, 1200)}` },
        ],
        temperature: 0.3,
        max_tokens: 200,
        timeout: 30000,
      });
      summary = String(content || '').trim().slice(0, 300);
    } catch (e) {
      console.warn('[ai:summarize] failed', e.message);
    }
  }

  aiCache.put(hash, { score, importance, summary, matched_keywords });

  return { score, importance, summary, matched_keywords };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}