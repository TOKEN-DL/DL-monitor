// 数据源基类，统一接口
export class BaseSource {
  /**
   * @returns {{name: string, fetch: () => Promise<Array<{title:string, url:string, content?:string, source_id?:string, published_at?:number, meta?:object}>>}}
   */
  static meta() {
    throw new Error('not implemented');
  }
}

export function defineSource(name, fetcher, opts = {}) {
  return {
    name,
    description: opts.description || '',
    enabled: opts.enabled !== false,
    async fetch() {
      try {
        const items = await fetcher();
        return items.map(normalize);
      } catch (e) {
        console.error(`[source:${name}] fetch error:`, e.message);
        return [];
      }
    }
  };
}

function normalize(item) {
  return {
    title: String(item.title || '').slice(0, 500),
    url: String(item.url || ''),
    content: item.content ? String(item.content).slice(0, 5000) : '',
    source_id: item.source_id ? String(item.source_id) : null,
    published_at: typeof item.published_at === 'number' ? item.published_at : null,
    meta: item.meta || null,
  };
}

export async function safeFetchJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': opts.ua || 'DL-monitor/0.1 (+https://localhost)',
        ...(opts.headers || {}),
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function safeFetchText(url, opts = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': opts.ua || 'DL-monitor/0.1 (+https://localhost)',
        ...(opts.headers || {}),
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.text();
  } finally {
    clearTimeout(timeout);
  }
}