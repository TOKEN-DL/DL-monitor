// DL-monitor 前端入口
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  keywords: [],
  hotspots: [],
  status: null,
  ws: null,
  pushEnabled: false,
  filters: { source: '', keyword: '' },
};

const VAPID_KEY_B64 = (() => {
  // 转换为浏览器需要的 URL-safe base64 → Uint8Array
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };
  return null; // 后续从 /api/push/vapid 注入
})();

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

function toast({ title, msg, kind = 'info' }) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="toast-title">${title}</div><div>${msg}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = (Date.now() - ts) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s 前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m 前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h 前`;
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- 关键词 ----------
async function loadKeywords() {
  const { items } = await api('/keywords');
  state.keywords = items;
  renderKeywords();
}

function renderKeywords() {
  const list = $('#kw-list');
  list.innerHTML = '';
  $('#kw-count').textContent = state.keywords.length;
  for (const kw of state.keywords) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="kw-text">${escapeHtml(kw.text)}</span>
      <span class="kw-cat">${escapeHtml(kw.category)}</span>
      <button class="kw-del" data-id="${kw.id}" title="删除">×</button>
    `;
    list.appendChild(li);
  }
  list.querySelectorAll('.kw-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('删除该关键词？')) return;
      await api(`/keywords/${id}`, { method: 'DELETE' });
      await loadKeywords();
      toast({ title: '已删除', msg: '', kind: 'info' });
    });
  });
}

$('#kw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#kw-text').value.trim();
  const category = $('#kw-category').value;
  if (!text) return;
  try {
    await api('/keywords', { method: 'POST', body: { text, category } });
    $('#kw-text').value = '';
    await loadKeywords();
    toast({ title: '已添加', msg: text, kind: 'info' });
  } catch (e) {
    toast({ title: '添加失败', msg: e.message, kind: 'error' });
  }
});

// ---------- 数据源 ----------
async function loadStatus() {
  state.status = await api('/status');
  renderSourceList();
  renderConfig();
  renderHeartbeat();
  // AI 状态
  const ai = $('#ai-status');
  ai.className = 'status-item ' + (state.status.openrouter.enabled ? 'on' : 'warn');
  ai.querySelector('.label').textContent = state.status.openrouter.enabled ? 'AI:ON' : 'AI:--';
}

function renderSourceList() {
  const list = $('#source-list');
  list.innerHTML = '';
  for (const [name, enabled] of Object.entries(state.status.sources)) {
    const li = document.createElement('li');
    li.className = enabled ? 'on' : 'off';
    li.innerHTML = `<span>${name}</span><span>${enabled ? '● ON' : '○ OFF'}</span>`;
    list.appendChild(li);
  }
}

function renderConfig() {
  const list = $('#config-list');
  const s = state.status;
  list.innerHTML = `
    <li><span>OpenRouter</span><span class="val ${s.openrouter.enabled ? 'on' : 'off'}">${s.openrouter.enabled ? '已启用' : '未配置'}</span></li>
    <li><span>VAPID 推送</span><span class="val ${s.vapid_configured ? 'on' : 'off'}">${s.vapid_configured ? '就绪' : '未生成'}</span></li>
    <li><span>SMTP 邮件</span><span class="val ${s.smtp_configured ? 'on' : 'off'}">${s.smtp_configured ? '已配置' : '占位'}</span></li>
    <li><span>AI 分类模型</span><span class="val">${escapeHtml(s.openrouter.classify_model.split('/').pop())}</span></li>
  `;
}

function renderHeartbeat() {
  const list = $('#heartbeat-list');
  list.innerHTML = '';
  const map = Object.fromEntries((state.status.source_status || []).map(s => [s.source, s]));
  for (const [name] of Object.entries(state.status.sources)) {
    const s = map[name];
    const li = document.createElement('li');
    if (!s) {
      li.innerHTML = `<span>${name}</span><span class="val off">未运行</span>`;
    } else {
      const ago = timeAgo(s.last_run_at);
      const cls = s.last_status === 'ok' ? 'on' : 'off';
      li.innerHTML = `<span>${name}</span><span class="val ${cls}">${s.last_status} · ${ago}</span>`;
    }
    list.appendChild(li);
  }
}

// ---------- 热点 ----------
async function loadHotspots() {
  const params = new URLSearchParams();
  if (state.filters.source) params.set('source', state.filters.source);
  if (state.filters.keyword) params.set('keyword', state.filters.keyword);
  params.set('limit', '100');
  const { items } = await api(`/hotspots?${params}`);
  state.hotspots = items;
  renderHotspots();
}

function renderHotspots(newItem = null) {
  const stream = $('#hotspots');
  const empty = $('#empty-state');

  if (state.hotspots.length === 0) {
    stream.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  if (newItem) {
    prependHotspot(newItem);
    return;
  }
  stream.innerHTML = '';
  for (const h of state.hotspots.slice(0, 100)) appendHotspot(h);
}

function appendHotspot(h) {
  const tpl = $('#hotspot-tpl').content.cloneNode(true);
  const card = tpl.querySelector('.hotspot-card');
  const importance = h.ai_importance ?? 0.5;
  if (importance >= 0.75) card.classList.add('high');

  card.querySelector('.source-tag').textContent = h.source;
  card.querySelector('.bar-fill').style.width = (importance * 100).toFixed(0) + '%';
  card.querySelector('.importance-num').textContent = importance.toFixed(2);
  card.querySelector('.card-title').textContent = h.title;
  card.querySelector('.card-summary').textContent = h.ai_summary || '(暂无摘要)';
  const link = card.querySelector('.card-link');
  link.href = h.url;
  card.querySelector('.card-time').textContent = timeAgo(h.fetched_at);

  const kwBox = card.querySelector('.card-keywords');
  let matched = h.matched_keywords;
  if (typeof matched === 'string') {
    try { matched = JSON.parse(matched); } catch { matched = []; }
  }
  for (const kw of matched || []) {
    const span = document.createElement('span');
    span.className = 'kw';
    span.textContent = '#' + kw;
    kwBox.appendChild(span);
  }
  $('#hotspots').appendChild(card);
}

function prependHotspot(h) {
  const tpl = $('#hotspot-tpl').content.cloneNode(true);
  const card = tpl.querySelector('.hotspot-card');
  const importance = h.importance ?? h.ai_importance ?? 0.5;
  if (importance >= 0.75) card.classList.add('high');

  card.querySelector('.source-tag').textContent = h.source;
  card.querySelector('.bar-fill').style.width = (importance * 100).toFixed(0) + '%';
  card.querySelector('.importance-num').textContent = importance.toFixed(2);
  card.querySelector('.card-title').textContent = h.title;
  card.querySelector('.card-summary').textContent = h.summary || h.ai_summary || '(暂无摘要)';
  card.querySelector('.card-link').href = h.url;
  card.querySelector('.card-time').textContent = '刚刚';

  const kwBox = card.querySelector('.card-keywords');
  for (const kw of h.matched_keywords || []) {
    const span = document.createElement('span');
    span.className = 'kw';
    span.textContent = '#' + kw;
    kwBox.appendChild(span);
  }
  $('#hotspots').prepend(card);
  state.hotspots.unshift(h);
  // 高重要性 toast
  if (importance >= 0.75) {
    toast({ title: `🔥 ${h.source}`, msg: h.title.slice(0, 80), kind: 'info' });
  }
}

$('#filter-source').addEventListener('change', (e) => {
  state.filters.source = e.target.value;
  loadHotspots();
});
$('#filter-keyword').addEventListener('input', (e) => {
  state.filters.keyword = e.target.value.trim();
  loadHotspots();
});
$('#refresh-btn').addEventListener('click', async () => {
  toast({ title: '触发抓取', msg: '请稍候...', kind: 'info' });
  try {
    await api('/run', { method: 'POST' });
    setTimeout(loadHotspots, 4000);
  } catch (e) {
    toast({ title: '触发失败', msg: e.message, kind: 'error' });
  }
});

// ---------- WebSocket ----------
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;
  ws.addEventListener('open', () => {
    $('#ws-status').className = 'status-item on';
    $('#ws-status').querySelector('.label').textContent = 'WS:LIVE';
  });
  ws.addEventListener('close', () => {
    $('#ws-status').className = 'status-item warn';
    $('#ws-status').querySelector('.label').textContent = 'WS:--';
    setTimeout(connectWS, 3000);
  });
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hotspot') {
      prependHotspot(msg.data);
    } else if (msg.type === 'source_run') {
      // 可选：刷新心跳
      loadStatus();
    }
  });
}

// ---------- 推送 ----------
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast({ title: '不支持推送', msg: '请用现代浏览器', kind: 'warn' });
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const { publicKey, configured } = await api('/push/vapid');
    if (!configured) {
      toast({ title: 'VAPID 未配置', msg: '重启服务自动生成', kind: 'warn' });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast({ title: '通知权限被拒绝', msg: '', kind: 'warn' });
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api('/push/subscribe', { method: 'POST', body: sub });
    state.pushEnabled = true;
    $('#push-status').className = 'status-item on';
    $('#push-status').querySelector('.label').textContent = 'PUSH:ON';
    $('#enable-push').innerHTML = '<span class="cta-icon">✓</span><span>推送已启用</span>';
    toast({ title: '推送已启用', msg: '重要热点将通知', kind: 'info' });
  } catch (e) {
    console.error(e);
    toast({ title: '推送启用失败', msg: e.message, kind: 'error' });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

$('#enable-push').addEventListener('click', enablePush);

// ---------- 启动 ----------
(async () => {
  await loadStatus();
  await loadKeywords();
  await loadHotspots();
  connectWS();
  setInterval(loadStatus, 30000);
  // 推送状态从本地查询
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        state.pushEnabled = true;
        $('#push-status').className = 'status-item on';
        $('#push-status').querySelector('.label').textContent = 'PUSH:ON';
        $('#enable-push').innerHTML = '<span class="cta-icon">✓</span><span>推送已启用</span>';
      }
    }
  }
})();