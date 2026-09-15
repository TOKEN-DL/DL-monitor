import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

export function attachSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  console.log(`[ws] attached at /ws`);
}

export function broadcast(event, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type: event, data, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === 1) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

export function clientCount() {
  return clients.size;
}