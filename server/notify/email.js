// 邮件聚合推送：每日 9:00 / 21:00 发送当日 Top 10
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { hotspotsRepo } from '../db.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.enabled) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

export async function sendDailyDigest() {
  const t = getTransporter();
  if (!t) return { sent: 0, skipped: 'smtp_disabled' };
  const since = Date.now() - 24 * 3600 * 1000;
  const items = hotspotsRepo.since(since)
    .filter(h => h.ai_importance)
    .sort((a, b) => (b.ai_importance || 0) - (a.ai_importance || 0))
    .slice(0, 10);

  if (!items.length) return { sent: 0, skipped: 'no_items' };

  const html = renderHtml(items);
  const text = items.map((h, i) =>
    `${i + 1}. [${h.source}] ${h.title}\n${h.ai_summary || ''}\n${h.url}`
  ).join('\n\n');

  try {
    const info = await t.sendMail({
      from: config.smtp.from || config.smtp.user,
      to: config.smtp.to,
      subject: `[DL-monitor] AI 热点日报 ${new Date().toLocaleDateString('zh-CN')}`,
      text,
      html,
    });
    return { sent: 1, messageId: info.messageId };
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return { sent: 0, error: e.message };
  }
}

function renderHtml(items) {
  const rows = items.map((h, i) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #1a3a3a;color:#00ffd5;font-weight:bold;width:36px;">${i + 1}</td>
      <td style="padding:12px;border-bottom:1px solid #1a3a3a;">
        <div style="color:#0a0e1a;font-size:14px;font-weight:bold;">[${h.source}] ${escapeHtml(h.title)}</div>
        <div style="color:#3a4a4a;font-size:13px;margin-top:6px;">${escapeHtml(h.ai_summary || '')}</div>
        <div style="margin-top:6px;">
          <span style="display:inline-block;padding:2px 8px;background:#00ffd5;color:#0a0e1a;border-radius:3px;font-size:11px;">
            重要性 ${(h.ai_importance || 0).toFixed(2)}
          </span>
          <a href="${h.url}" style="margin-left:8px;color:#0066cc;font-size:12px;">查看原文 →</a>
        </div>
      </td>
    </tr>
  `).join('');
  return `
  <div style="font-family:'Microsoft YaHei',sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;padding:24px;">
      <h1 style="color:#0a0e1a;border-bottom:2px solid #00ffd5;padding-bottom:10px;">
        🔥 DL-monitor · AI 热点日报
      </h1>
      <p style="color:#666;font-size:13px;">${new Date().toLocaleString('zh-CN')} · Top ${items.length}</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="color:#999;font-size:11px;margin-top:24px;text-align:center;">
        由 DL-monitor 自动生成 · 配置 SMTP 启用本推送
      </p>
    </div>
  </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}