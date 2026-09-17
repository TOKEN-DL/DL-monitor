// 信息保留策略（3-tier retention）
//
// 阈值参考基准（基于 X/Twitter 真实数据）：
//   - @OpenAI GPT-5 / @AnthropicAI Claude 4 / DeepSeek R1 等官方发布推文：3M+ views
//   - KOL 重要反应推文（@karpathy / @sama / @ylecun 等）：100K-1M views
//   - 一般新闻 / 小账号：10K-50K views
// → 100K (10万) 作为"重要模型发布相关"基准，能区分有保留价值 vs 一般噪音
//
// 行为：
//   1. Hot      — fetched_at 在 windowDays 天内（默认 7 天）→ 主 feed 显示
//   2. Archived — fetched_at 超 windowDays 且 views >= archiveViews → DB 保留但隐藏
//   3. Deleted  — fetched_at 超 windowDays 且 views <  archiveViews → 物理删除
//
// 例外：白名单作者的推文永不自动删除（仅可能归档），保护重要 KOL 历史
import { db, hotspotsRepo, whitelistRepo } from '../db.js';
import { config } from '../config.js';

/**
 * 执行一次保留策略
 * @returns {Promise<{archived: number, deleted: number, skipped: number, took_ms: number}>}
 */
export async function runRetention() {
  if (!config.retention.enabled) {
    return { skipped: 'disabled' };
  }
  const t0 = Date.now();
  const windowMs = config.retention.windowDays * 86400 * 1000;
  const cutoff = Date.now() - windowMs;
  const archiveThreshold = config.retention.archiveViews;

  // 白名单豁免：永不自动删除
  const wl = whitelistRepo.hasSet();

  const candidates = hotspotsRepo.retentionCandidates(cutoff);

  let archived = 0;
  let deleted = 0;
  let whitelistKept = 0;

  for (const row of candidates) {
    let m = null;
    try { m = JSON.parse(row.meta || '{}'); } catch {}
    const handle = m ? String(m.handle || '').toLowerCase() : '';

    // 白名单保护：不归档也不删除（白名单用户推文始终保留）
    if (wl.has(handle)) {
      whitelistKept++;
      continue;
    }

    const views = m?.views || 0;
    // 仅对有浏览量指标的源（twitter）执行严格阈值
    // 其他源（HN / GitHub / HF / arxiv / bilibili）按各自信号保留
    if (row.source === 'twitter') {
      if (views >= archiveThreshold) {
        hotspotsRepo.archive(row.id);
        archived++;
      } else {
        hotspotsRepo.purge(row.id);
        deleted++;
      }
    } else {
      // 非 twitter 源：7 天内仍保留（按 importance 排序，过 7 天归档而非删除）
      // 这些源的"重要性"已通过 ai_importance 表达，无浏览量指标可参考
      hotspotsRepo.archive(row.id);
      archived++;
    }
  }

  const result = {
    archived,
    deleted,
    whitelistKept,
    windowDays: config.retention.windowDays,
    archiveThreshold,
    scanned: candidates.length,
    took_ms: Date.now() - t0,
  };
  console.log(`[retention] scanned=${result.scanned} archived=${archived} deleted=${deleted} whitelistKept=${whitelistKept} (${result.took_ms}ms)`);
  return result;
}

/**
 * 统计当前保留状态（供前端状态栏展示）
 */
export function retentionStats() {
  const cutoff = Date.now() - config.retention.windowDays * 86400 * 1000;
  const total = db.prepare('SELECT COUNT(*) as n FROM hotspots').get().n;
  const active = db.prepare(
    'SELECT COUNT(*) as n FROM hotspots WHERE archived_at IS NULL AND fetched_at >= ?'
  ).get(cutoff).n;
  const staleActive = db.prepare(
    'SELECT COUNT(*) as n FROM hotspots WHERE archived_at IS NULL AND fetched_at < ?'
  ).get(cutoff).n;
  const archived = db.prepare(
    'SELECT COUNT(*) as n FROM hotspots WHERE archived_at IS NOT NULL'
  ).get().n;
  return {
    total,
    active,
    stale_active: staleActive,
    archived,
    windowDays: config.retention.windowDays,
    archiveThreshold: config.retention.archiveViews,
    enabled: config.retention.enabled,
  };
}