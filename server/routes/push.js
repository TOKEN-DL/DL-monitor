import { Router } from 'express';
import webpush from 'web-push';
import { config } from '../config.js';
import { subsRepo } from '../db.js';

const router = Router();

function configureVapid() {
  if (!config.vapid.publicKey || !config.vapid.privateKey) return false;
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
  return true;
}

router.get('/vapid', (req, res) => {
  res.json({
    configured: !!config.vapid.publicKey,
    publicKey: config.vapid.publicKey || null,
  });
});

router.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'invalid subscription' });
  }
  const added = subsRepo.add(sub);
  res.json({ ok: true, added });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  res.json({ ok: true, removed: subsRepo.remove(endpoint) });
});

export async function sendPushAll(payload) {
  if (!configureVapid()) {
    return { sent: 0, skipped: 'vapid_not_configured' };
  }
  const subs = subsRepo.all();
  let sent = 0, dead = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 }
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        subsRepo.remove(s.endpoint);
        dead++;
      } else {
        console.warn('[push] send failed', e.statusCode || e.message);
      }
    }
  }));
  return { sent, dead, total: subs.length };
}

export default router;