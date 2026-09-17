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
  /**
   * 拉取热点列表
   * @param {Object} opts
   * @param {string} [opts.source] - 过滤来源（如 'twitter' / 'bilibili'）
   * @param {string} [opts.keyword] - 关键词过滤
   * @param {number} [opts.limit=100]
   * @param {number} [opts.minViews] - 浏览量阈值；undefined=让服务端用配置默认；0=禁用
   * @param {number} [opts.minFollowers] - 粉丝阈值
   * @param {number} [opts.minImportance] - AI 重要度阈值（0-1）；undefined=服务端默认；0=禁用
   * @param {'active'|'archived'|'all'} [opts.archive='active'] - 信息保留过滤
   */
  list: ({ source = '', keyword = '', limit = 100, minViews, minFollowers, minImportance, archive = 'active' } = {}) => {
    const p = new URLSearchParams();
    if (source) p.set('source', source);
    if (keyword) p.set('keyword', keyword);
    if (minViews !== undefined) p.set('min_views', String(minViews));
    if (minFollowers !== undefined) p.set('min_followers', String(minFollowers));
    if (minImportance !== undefined) p.set('min_importance', String(minImportance));
    if (archive !== 'active') p.set('archive', archive);
    p.set('limit', String(limit));
    return api(`/hotspots?${p}`).then((r) => r.items);
  },
  archive: (id) => api(`/hotspots/${id}/archive`, { method: 'POST' }),
  unarchive: (id) => api(`/hotspots/${id}/unarchive`, { method: 'POST' }),
};

export const retentionApi = {
  stats: () => api('/retention/stats'),
  run: () => api('/retention/run', { method: 'POST' }),
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

export const whitelistApi = {
  list: () => api('/twitter-whitelist').then((r) => r.items),
  add: (handle, type = 'person', note = '') =>
    api('/twitter-whitelist', { method: 'POST', body: { handle, type, note } }),
  remove: (id) => api(`/twitter-whitelist/${id}`, { method: 'DELETE' }),
};

export const sourceApi = {
  /** 列出所有信息源（内置 + 用户） */
  list: () => api('/sources').then((r) => r.items),
  /**
   * 新增用户信息源（name + label + url）
   * 后端会先测试抓取（test_fetch=true），返回 test_ok / test_count / test_error
   */
  add: ({ name, label, url, enabled = true, test_fetch = true }) =>
    api('/sources', {
      method: 'POST',
      body: { name, label, url, enabled, test_fetch },
    }),
  toggle: (name, enabled) =>
    api(`/sources/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { enabled },
    }),
  rename: (name, label) =>
    api(`/sources/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { label },
    }),
  remove: (name) =>
    api(`/sources/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};