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
   * @param {string} [opts.source] - 单来源过滤（向后兼容）
   * @param {string[]} [opts.sources] - 多来源过滤（F1）
   * @param {string} [opts.keyword] - 单关键词（向后兼容）
   * @param {string[]} [opts.keywords] - 多关键词命中（F2，任一命中）
   * @param {number} [opts.limit=100]
   * @param {number} [opts.minViews] - 浏览量阈值；undefined=让服务端用配置默认；0=禁用
   * @param {number} [opts.minFollowers] - 粉丝阈值
   * @param {number} [opts.minImportance] - AI 重要度下限（0-1）；undefined=服务端默认；0=禁用
   * @param {number} [opts.maxImportance=1] - AI 重要度上限（F4 双滑块右值）
   * @param {'recent'|'published'|'importance'|'burst'} [opts.sort='recent'] - 排序方式
   * @param {'active'|'archived'|'all'} [opts.archive='active'] - 信息保留过滤
   * @param {'1h'|'6h'|'24h'|'3d'|'7d'|'all'} [opts.window] - 时间窗（F5）
   * @param {string[]} [opts.quickTags] - 一键标签：'kol' | 'burst'
   */
  list: ({
      source = '', sources = null,
      keyword = '', keywords = null,
      limit = 100,
      minViews, minFollowers, minImportance, maxImportance,
      sort = 'recent',
      archive = 'active', window,
      quickTags = [],
    } = {}) => {
    const p = new URLSearchParams();
    if (source) p.set('source', source);
    if (Array.isArray(sources) && sources.length) p.set('sources', sources.join(','));
    if (keyword) p.set('keyword', keyword);
    if (Array.isArray(keywords) && keywords.length) p.set('keywords', keywords.join(','));
    if (minViews !== undefined) p.set('min_views', String(minViews));
    if (minFollowers !== undefined) p.set('min_followers', String(minFollowers));
    if (minImportance !== undefined) p.set('min_importance', String(minImportance));
    if (maxImportance !== undefined && maxImportance < 1) p.set('min_importance_max', String(maxImportance));
    if (sort !== 'recent') p.set('sort', sort);
    if (archive !== 'active') p.set('archive', archive);
    if (window && window !== '7d') p.set('window', window);
    if (quickTags.length) p.set('quick_tag', quickTags.join(','));
    p.set('limit', String(limit));
    return api(`/hotspots?${p}`).then((r) => r.items);
  },
  /**
   * 按来源计数（用于 C3 chip 匹配数）
   * @param {Object} opts - 与 list 相同的过滤参数（不含 sort/limit）
   */
  countBySource: (opts = {}) => {
    const p = new URLSearchParams();
    const { source, sources, keyword, keywords, minViews, minFollowers, minImportance, maxImportance, archive, window, quickTags } = opts;
    if (source) p.set('source', source);
    if (Array.isArray(sources) && sources.length) p.set('sources', sources.join(','));
    if (keyword) p.set('keyword', keyword);
    if (Array.isArray(keywords) && keywords.length) p.set('keywords', keywords.join(','));
    if (minFollowers !== undefined) p.set('min_followers', String(minFollowers));
    if (minImportance !== undefined) p.set('min_importance', String(minImportance));
    if (maxImportance !== undefined && maxImportance < 1) p.set('min_importance_max', String(maxImportance));
    if (archive && archive !== 'active') p.set('archive', archive);
    if (window && window !== '7d') p.set('window', window);
    if (quickTags && quickTags.length) p.set('quick_tag', quickTags.join(','));
    return api(`/hotspots/count-by-source?${p}`);
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