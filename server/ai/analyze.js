// AI 分析：分类 → 摘要 → 翻译（独立廉价调用，所有卡片标题都翻译）
import { config } from '../config.js';
import { chatCompletion, extractJSON } from './openrouter.js';
import { aiCache, hashContent, keywordsRepo } from '../db.js';

const CLASSIFY_SYSTEM = `你是 AI 编程博主的助理。给定一段内容，判断它是否与用户的关键词列表相关，并评估其重要性（0-1）。
请严格返回 JSON，不要任何其他文字。
返回格式：
{"score": 0.0-1.0, "importance": 0.0-1.0, "matched_keywords": ["关键词1","关键词2"], "reason": "一句话中文解释"}
- score: 严格相关度，0=无关，1=直接讲关键词
- importance: 综合重要性，考虑内容时效性、影响范围、是否为新发布/更新
- 信号强度加成：如果内容来自 verified 账号、粉丝 ≥ 5000、浏览 ≥ 2000，可在 importance 上调高 0.1-0.2（作为权威信号）
- 如果内容是热搜词（source 含 zhihu-trends）且命中用户关键词，可视为强信号，importance +0.1-0.2
- matched_keywords: 命中的关键词子集（可为空）`;

const SUMMARIZE_SYSTEM = `你是 AI 领域资深博主，给定一段内容，写一句中文摘要（30-80字），让读者一眼明白发生了什么。
要求：客观、简洁、不要 Markdown、不要引号、不要"标题："等前缀。如果内容不是中文圈事件，用中文翻译关键信息。`;

const TRANSLATE_SYSTEM = `你是中英翻译专家。给定一个标题（或一段内容），返回简体中文版本。
要求：
1. 严格 JSON 格式：{"title_zh": "..."}
2. 标题必须翻译；若原文已是中文则润色表达；保留专有名词（GPT-5 / Claude / DeepSeek / Qwen 等模型名保留英文）
3. 简洁自然，不超过 60 字
4. 不要任何额外解释或前缀`;

export async function analyzeItem(item) {
  const hash = hashContent(item.url);
  const cached = aiCache.get(hash);
  if (cached && cached.created_at > Date.now() - 24 * 3600 * 1000) {
    return {
      score: cached.score,
      importance: cached.importance,
      summary: cached.summary,
      matched_keywords: cached.matched_keywords ? JSON.parse(cached.matched_keywords) : [],
      title_zh: cached.title_zh || null,
      cached: true,
    };
  }
  const kws = keywordsRepo.enabled().map(k => k.text);
  if (!kws.length) {
    // 没有关键词就跳过相关性分析，但仍生成摘要 + 翻译
    const summary = await genSummary(item);
    const title_zh = await genTranslation(item);
    aiCache.put(hash, { score: 0.5, importance: 0.5, summary, matched_keywords: [], title_zh });
    return { score: 0.5, importance: 0.5, summary, matched_keywords: [], title_zh };
  }

  // 1) 分类（相关性 + 重要性）
  const meta = item.meta || {};
  const signalInfo = buildSignalInfo(item.source, meta);
  const userMsg = `关键词列表：${kws.join('、')}
\n来源：${item.source}
${signalInfo}
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

  // 白名单权威加成：KOL 命中时 importance +0.1（封顶 1.0）
  if (meta.whitelisted === true && importance < 1) {
    importance = Math.min(1, importance + 0.1);
  }

  // 2) 仅当相关性超过阈值才生成摘要（节省 token）
  let summary = null;
  if (score >= 0.4) {
    summary = await genSummary(item);
  }

  // 3) 翻译标题为中文（无条件执行，所有卡片都翻译）
  const title_zh = await genTranslation(item);

  aiCache.put(hash, { score, importance, summary, matched_keywords, title_zh });

  return { score, importance, summary, matched_keywords, title_zh };
}

async function genSummary(item) {
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
    return String(content || '').trim().slice(0, 300);
  } catch (e) {
    console.warn('[ai:summarize] failed', e.message);
    return null;
  }
}

/**
 * 翻译标题为简体中文（无条件，所有卡片都翻译）
 * 用便宜的小模型（classifyModel），快速廉价
 */
async function genTranslation(item) {
  const title = (item.title || '').trim();
  if (!title) return null;
  // 简单启发式：中文比例 > 50% 视为已是中文，跳过翻译
  if (looksLikeChinese(title)) return title.slice(0, 200);
  try {
    const { content } = await chatCompletion({
      model: config.openrouter.classifyModel,
      messages: [
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: title.slice(0, 400) },
      ],
      temperature: 0.1,
      max_tokens: 120,
      json: true,
      timeout: 20000,
    });
    const parsed = extractJSON(content);
    if (parsed && parsed.title_zh) {
      return String(parsed.title_zh).trim().slice(0, 200);
    }
  } catch (e) {
    console.warn('[ai:translate] failed', e.message);
  }
  return null;
}

function looksLikeChinese(s) {
  if (!s) return false;
  let cn = 0;
  for (const ch of s) {
    if (/[一-龥]/.test(ch)) cn++;
  }
  return s.length > 0 && cn / s.length > 0.5;
}

/**
 * 把每源的"信号强度"拼成自然语言，注入到 AI prompt
 * Twitter：verified + followers + views
 * B站：粉丝 + 播放
 * 账号识别（account:*）：平台 + 粉丝 + 签名
 * 热搜词（zhihu-trends / weibo-trends）：排名 + 平台
 * 其他：仅基础字段
 */
function buildSignalInfo(source, meta) {
  if (!meta) return '';
  const parts = [];
  // 账号识别虚拟源（source 形如 "account:bilibili:karpathy"）
  if (typeof source === 'string' && source.startsWith('account:')) {
    if (meta.platform) parts.push(`平台: ${meta.platform}`);
    if (meta.fans) parts.push(`粉丝数: ${meta.fans}`);
    if (meta.videos) parts.push(`视频数: ${meta.videos}`);
    if (meta.sign) parts.push(`签名: ${String(meta.sign).slice(0, 60)}`);
    if (meta.query_handle) parts.push(`用户输入: @${meta.query_handle}`);
    if (meta.is_account_resolution) parts.push('★ 账号识别结果');
    return parts.length ? `\n信号强度：${parts.join('，')}` : '';
  }
  switch (source) {
    case 'twitter':
      if (meta.isBlueVerified || meta.isVerified) parts.push('verified: 是');
      if (meta.followers) parts.push(`粉丝数: ${meta.followers}`);
      if (meta.views) parts.push(`浏览量: ${meta.views}`);
      if (meta.likes || meta.retweets || meta.replies) {
        parts.push(`互动: 赞${meta.likes||0}/转${meta.retweets||0}/评${meta.replies||0}`);
      }
      if (meta.whitelisted) parts.push('★ 白名单作者');
      break;
    case 'bilibili':
      // 普通视频 + UP主列表（来自 B站搜索）
      if (meta.is_up_master) {
        if (meta.fans) parts.push(`UP主粉丝: ${meta.fans}`);
        if (meta.videos) parts.push(`视频数: ${meta.videos}`);
        if (meta.sign) parts.push(`签名: ${String(meta.sign).slice(0, 60)}`);
        if (meta.level) parts.push(`等级: Lv${meta.level}`);
      } else {
        if (meta.followers) parts.push(`UP主粉丝: ${meta.followers}`);
        if (meta.plays) parts.push(`播放量: ${meta.plays}`);
        if (meta.likes) parts.push(`点赞: ${meta.likes}`);
        if (meta.tag) parts.push(`分区: ${meta.tag}`);
      }
      break;
    case 'zhihu-trends':
      if (meta.rank) parts.push(`排名: #${meta.rank}`);
      if (meta.display_query) parts.push(`热搜词: ${meta.display_query}`);
      parts.push('知乎实时热搜词');
      break;
    case 'weibo-trends':
      parts.push('微博热搜词');
      break;
    case 'google':
      if (meta.source_news) parts.push(`来源媒体: ${meta.source_news}`);
      break;
    case 'github':
      if (meta.stars) parts.push(`⭐: ${meta.stars}`);
      if (meta.language) parts.push(`语言: ${meta.language}`);
      break;
    case 'hackernews':
      if (meta.score) parts.push(`score: ${meta.score}`);
      if (meta.descendants) parts.push(`评论: ${meta.descendants}`);
      break;
    case 'huggingface':
      if (meta.kind) parts.push(`类型: ${meta.kind}`);
      if (meta.downloads) parts.push(`下载: ${meta.downloads}`);
      break;
  }
  return parts.length ? `\n信号强度：${parts.join('，')}` : '';
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}