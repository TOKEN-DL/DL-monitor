// 手动生成 VAPID 密钥的脚本（启动时也会自动生成）
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keys = webpush.generateVAPIDKeys();

const envPath = path.join(__dirname, '..', '.env');
let content = '';
if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
const set = (k, v) => {
  const re = new RegExp(`^${k}=.*$`, 'm');
  return re.test(content) ? content.replace(re, `${k}=${v}`) : `${content}\n${k}=${v}\n`;
};
content = set('VAPID_PUBLIC_KEY', keys.publicKey);
content = set('VAPID_PRIVATE_KEY', keys.privateKey);
fs.writeFileSync(envPath, content);

console.log('VAPID keys generated and saved to .env:');
console.log('  Public:', keys.publicKey);
console.log('  Private:', keys.privateKey);
console.log(`  Subject: ${config.vapid.subject}`);