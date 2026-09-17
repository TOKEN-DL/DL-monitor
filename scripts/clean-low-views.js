// 清理历史库中浏览量低于阈值且非白名单的 Twitter 推文
// 用法：node scripts/clean-low-views.js [--dry-run] [--min-views=2000]
import { db, whitelistRepo } from '../server/db.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minViewsArg = args.find(a => a.startsWith('--min-views='));
const MIN_VIEWS = minViewsArg ? Number(minViewsArg.split('=')[1]) : 2000;

const whitelist = new Set(whitelistRepo.list().map(w => w.handle.toLowerCase()));
console.log(`白名单 ${whitelist.size} 个 handle`);
console.log(`浏览量阈值 ${MIN_VIEWS}\n`);

const rows = db.prepare(
  `SELECT id, title, meta, fetched_at FROM hotspots WHERE source = 'twitter'`
).all();

const toDelete = [];
const breakdown = { belowThreshold: 0, whiteListed: 0, normal: 0 };

for (const r of rows) {
  let m = null;
  try { m = JSON.parse(r.meta || '{}'); } catch {}
  if (!m) continue;
  const views = m.views || 0;
  const handle = (m.handle || '').toLowerCase();
  if (whitelist.has(handle)) {
    breakdown.whiteListed++;
    continue;
  }
  if (views >= MIN_VIEWS) {
    breakdown.normal++;
    continue;
  }
  breakdown.belowThreshold++;
  toDelete.push({
    id: r.id,
    handle,
    views,
    fans: m.followers || 0,
    title: (r.title || '').slice(0, 50),
    fetched: new Date(r.fetched_at).toISOString().slice(0, 10),
  });
}

console.log('=== 统计 ===');
console.log('总 Twitter 推文:', rows.length);
console.log('白名单作者:', breakdown.whiteListed);
console.log('views ≥ 2000 (合规):', breakdown.normal);
console.log('views < 2000 (待删除):', breakdown.belowThreshold);

if (toDelete.length === 0) {
  console.log('\n无需清理');
  process.exit(0);
}

console.log('\n=== 待清理样本（前 5 条）===');
for (const r of toDelete.slice(0, 5)) {
  console.log(`  #${r.id} ${r.fetched} | ${r.handle} | views=${r.views} fans=${r.fans}`);
  console.log(`     "${r.title}..."`);
}

if (dryRun) {
  console.log(`\n[dry-run] 跳过删除。运行不带 --dry-run 执行清理。`);
  process.exit(0);
}

const stmt = db.prepare('DELETE FROM hotspots WHERE id = ?');
let deleted = 0;
for (const r of toDelete) {
  stmt.run(r.id);
  deleted++;
}
console.log(`\n✅ 已清理 ${deleted} 条历史低浏览量推文`);