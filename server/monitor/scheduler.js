import cron from 'node-cron';
import { config } from '../config.js';
import { runSource } from './pipeline.js';
import { getAllSources } from '../sources/index.js';
import { sendDailyDigest } from '../notify/email.js';

const jobs = [];

export function startScheduler() {
  stopScheduler();
  const sources = getAllSources();
  for (const src of sources) {
    const expr = config.cron[src.name];
    if (!expr) continue;
    const job = cron.schedule(expr, async () => {
      const r = await runSource(src.name);
      console.log(`[scheduler:${src.name}]`, r.ok ? `+${r.new} new (${r.fetched} fetched, ${r.took_ms}ms)` : `error: ${r.error}`);
    }, { timezone: config.tz });
    jobs.push(job);
    console.log(`[scheduler] ${src.name}: "${expr}" (${config.tz})`);
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

  console.log(`[scheduler] ${jobs.length} jobs started`);

  // 启动后立即跑一次
  setTimeout(() => {
    for (const src of sources) runSource(src.name);
  }, 3000);
}

export function stopScheduler() {
  for (const j of jobs) j.stop();
  jobs.length = 0;
}