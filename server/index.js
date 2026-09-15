import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import './db.js'; // 初始化数据库
import apiRouter from './routes/api.js';
import pushRouter, { sendPushAll } from './routes/push.js';
import { attachSocket, broadcast } from './notify/socket.js';
import { startScheduler } from './monitor/scheduler.js';
import { initSources } from './sources/index.js';
import webpush from 'web-push';

const app = express();

app.use(express.json({ limit: '1mb' }));

// 前端构建产物（web/dist）作为首选静态目录；旧版 public/ 作为兜底
const webDistDir = path.join(config.root, 'web', 'dist');
if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir));
}
app.use(express.static(config.publicDir));

// CORS (开发场景使用，方便其他客户端测试)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', apiRouter);
app.use('/api/push', pushRouter);

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'sw.js'));
});

// 简易 favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 启动 HTTP + WS
const server = http.createServer(app);
attachSocket(server);

// 自动生成 VAPID（如缺失）
async function ensureVapid() {
  if (config.vapid.publicKey && config.vapid.privateKey) {
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    return;
  }
  try {
    const keys = webpush.generateVAPIDKeys();
    config.vapid.publicKey = keys.publicKey;
    config.vapid.privateKey = keys.privateKey;
    webpush.setVapidDetails(config.vapid.subject, keys.publicKey, keys.privateKey);
    // 持久化到 .env
    const envPath = path.join(config.root, '.env');
    let content = '';
    if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
    const updater = (k, v) => {
      const re = new RegExp(`^${k}=.*$`, 'm');
      return re.test(content) ? content.replace(re, `${k}=${v}`) : `${content}\n${k}=${v}\n`;
    };
    content = updater('VAPID_PUBLIC_KEY', keys.publicKey);
    content = updater('VAPID_PRIVATE_KEY', keys.privateKey);
    fs.writeFileSync(envPath, content);
    console.log('[vapid] auto-generated and saved to .env');
  } catch (e) {
    console.warn('[vapid] generation failed:', e.message);
  }
}

// 暴露广播给 pipeline 使用
global.__dlmonitor = { broadcast, sendPushAll };

(async () => {
  await ensureVapid();
  initSources();
  server.listen(config.port, () => {
    console.log(`\n╔════════════════════════════════════════════╗`);
    console.log(`║  DL-monitor running on http://localhost:${config.port}  ║`);
    console.log(`╚════════════════════════════════════════════╝\n`);
    console.log(`  • OpenRouter: ${config.openrouter.enabled ? '✓ enabled' : '✗ not configured'}`);
    console.log(`  • VAPID: ${config.vapid.publicKey ? '✓ ready' : '✗ not generated'}`);
    console.log(`  • SMTP: ${config.smtp.enabled ? '✓ enabled' : '✗ placeholder'}`);
    console.log(`  • Sources:`,
      Object.entries(config.sources).map(([k, v]) => `${k}:${v ? 'on' : 'off'}`).join(' '));
    console.log('');
    startScheduler();
  });
})();