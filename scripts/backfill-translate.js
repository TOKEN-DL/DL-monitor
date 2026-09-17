// 一次性脚本：为历史热点补齐 title_zh（AI 翻译）
// 用法：node scripts/backfill-translate.js [--dry-run] [--limit=50] [--min-importance=0]
import { db, aiCache, hashContent } from '../server/db.js';
import { config } from '../server/config.js';
import { chatCompletion, extractJSON } from '../server/ai/openrouter.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const minImpArg = args.find(a => a.startsWith('--min-importance='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 100;
const MIN_IMPORTANCE = minImpArg ? Number(minImpArg.split('=')[1]) : 0;

if (!config.openrouter.enabled) {
  console.error('OPENROUTER_KEY not set, abort');
  process.exit(1);
}

const TRANSLATE_SYSTEM = `你是中英翻译专家。给定一个标题，返回简体中文版本。
要求：
1. 严格 JSON 格式：{"title_zh": "..."}
2. 标题必须翻译；若原文已是中文则润色表达；保留专有名词（GPT-5 / Claude / DeepSeek / Qwen 等模型名保留英文）
3. 简洁自然，不超过 60 字
4. 不要任何额外解释或前缀`;

async function translateOne(title) {
  const t = (title || '').trim();
  if (!t) return null;
  // 已是中文（>50% CJK）跳过
  let cn = 0;
  for (const ch of t) if (/[一-龥]/.test(ch)) cn++;
  if (t.length > 0 && cn / t.length > 0.5) return t.slice(0, 200);

  try {
    const { content } = await chatCompletion({
      model: config.openrouter.classifyModel,
      messages: [
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: t.slice(0, 400) },
      ],
      temperature: 0.1,
      max_tokens: 120,
      json: true,
      timeout: 20000,
    });
    const parsed = extractJSON(content);
    if (parsed && parsed.title_zh) return String(parsed.title_zh).trim().slice(0, 200);
  } catch (e) {
    console.warn(`  ⚠ translate failed: ${e.message}`);
  }
  return null;
}

const stmt = db.prepare(`
  SELECT id, url, title, title_zh, ai_importance FROM hotspots
  WHERE (title_zh IS NULL OR title_zh = '')
    AND (ai_importance IS NULL OR ai_importance >= ?)
  ORDER BY COALESCE(ai_importance, 0) DESC, id DESC
  LIMIT ?
`);
const targets = stmt.all(MIN_IMPORTANCE, LIMIT);
const totalAll = db.prepare(`SELECT COUNT(*) as n FROM hotspots WHERE title_zh IS NULL OR title_zh = ''`).get().n;

console.log(`\n=== Backfill Translation ===`);
console.log(`未翻译条目总数: ${totalAll}`);
console.log(`本次翻译目标: ${targets.length} (min_importance >= ${MIN_IMPORTANCE})`);
console.log(dryRun ? '[dry-run] 不会写入数据库\n' : '');

const updateStmt = db.prepare('UPDATE hotspots SET title_zh = ? WHERE id = ?');
const updateCacheStmt = db.prepare('UPDATE ai_cache SET title_zh = ? WHERE content_hash = ?');

let success = 0, failed = 0, skipped = 0;
for (const row of targets) {
  const zh = await translateOne(row.title);
  if (!zh) {
    skipped++;
    continue;
  }
  if (dryRun) {
    console.log(`  [dry] #${row.id} "${row.title.slice(0, 50)}" → "${zh.slice(0, 50)}"`);
  } else {
    updateStmt.run(zh, row.id);
    const hash = hashContent(row.url);
    updateCacheStmt.run(zh, hash);
    success++;
    if (success % 10 === 0) console.log(`  ...${success}/${targets.length}`);
  }
}

console.log(`\n=== 结果 ===`);
console.log(`翻译成功: ${success}`);
console.log(`翻译失败/跳过: ${skipped}`);
if (dryRun) console.log(`(dry-run 模式，未写入数据库)`);