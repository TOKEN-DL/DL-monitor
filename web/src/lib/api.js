export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const keywordApi = {
  list: () => api('/keywords').then((r) => r.items),
  add: (text, category = 'general') =>
    api('/keywords', { method: 'POST', body: { text, category } }),
  remove: (id) => api(`/keywords/${id}`, { method: 'DELETE' }),
};

export const hotspotApi = {
  list: ({ source = '', keyword = '', limit = 100 } = {}) => {
    const p = new URLSearchParams();
    if (source) p.set('source', source);
    if (keyword) p.set('keyword', keyword);
    p.set('limit', String(limit));
    return api(`/hotspots?${p}`).then((r) => r.items);
  },
};

export const statusApi = {
  get: () => api('/status'),
};

export const pushApi = {
  vapid: () => api('/push/vapid'),
  subscribe: (sub) => api('/push/subscribe', { method: 'POST', body: sub }),
};

export const runApi = {
  trigger: (only = null) =>
    api('/run', { method: 'POST', body: only ? { only } : {} }),
};