import cron from 'node-cron';
import { config } from '../config.js';
import { runSource, runAllAccountResolutions } from './pipeline.js';
import { runRetention } from './retention.js';
import { getAllSources } from '../sources/index.js';
import { sendDailyDigest } from '../notify/email.js';

const jobs = [];

// 用户源默认 cron（所有用户源共享）
const USER_SOURCE_DEFAULT_CRON = process.env.CRON_USER_SOURCES || '13,43 * * * *';

export function startScheduler() {
  stopScheduler();
  const sources = getAllSources();
  for (const src of sources) {
    // 内置源从 config.cron 取；用户源（user:*）用默认 cron
    const expr = src.name.startsWith('user:') ? USER_SOURCE_DEFAULT_CRON : config.cron[src.name];
    if (!expr) continue;
    const job = cron.schedule(expr, async () => {
      const r = await runSource(src.name);
      console.log(`[scheduler:${src.name}]`, r.ok ? `+${r.new} new (${r.fetched} fetched, ${r.took_ms}ms)` : `error: ${r.error}`);
    }, { timezone: config.tz });
    jobs.push(job);
    console.log(`[scheduler] ${src.name}: "${expr}" (${config.tz})`);
  }

  // 账号识别定时任务（默认每小时第 7 分钟）
  const accountExpr = config.cron.accountResolve;
  if (accountExpr) {
    jobs.push(cron.schedule(accountExpr, async () => {
      const r = await runAllAccountResolutions();
      const acc = Object.values(r.results).filter(v => v.ok && v.new > 0).length;
      if (acc > 0) console.log(`[scheduler:account] resolved ${acc} keywords`);
    }, { timezone: config.tz }));
    console.log(`[scheduler] account-resolve: "${accountExpr}" (${config.tz})`);
  }

  // 每日 9:00 / 21:00 发送邮件聚合
  if (config.smtp.enabled) {
    jobs.push(cron.schedule('0 9,21 * * *', async () => {
      console.log('[email] sending daily digest...');
      const r = await sendDailyDigest();
      console.log('[email] result:', r);
    }, { timezone: config.tz }));
    console.log('[scheduler] email digest at 09:00 / 21:00');
  }

  // 信息保留策略：每天凌晨执行一次（默认 03:37，避开整点）
  if (config.retention.enabled && config.cron.retention) {
    jobs.push(cron.schedule(config.cron.retention, async () => {
      const r = await runRetention();
      if (r.archived || r.deleted) {
        console.log(`[scheduler:retention]`, r);
      }
    }, { timezone: config.tz }));
    console.log(`[scheduler] retention: "${config.cron.retention}" (windowDays=${config.retention.windowDays}, archiveViews=${config.retention.archiveViews})`);
  }

  console.log(`[scheduler] ${jobs.length} jobs started`);

  // 启动后立即跑一次
  setTimeout(() => {
    for (const src of sources) runSource(src.name);
    // 账号识别也立即跑一次
    runAllAccountResolutions().catch(e => console.warn('[scheduler:account] initial run failed:', e.message));
  }, 3000);
}

export function stopScheduler() {
  for (const j of jobs) j.stop();
  jobs.length = 0;
}