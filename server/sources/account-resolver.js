// 账号识别：当用户关键词以 @ 开头时，直接解析为博主信息
// 当前仅支持 B站 UP主（API 已验证可达）
// 复用 BaseSource 接口 → 自动获得 AI 分析、通知、去重、限流
import { defineSource, safeFetchJSON } from './base.js';
import { config } from '../config.js';

const BILI_SEARCH = 'https://api.bilibili.com/x/web-interface/search/all/v2';

/**
 * 判断关键词是否是账号查询（以 @ 开头）
 * @returns {{platform: string, handle: string} | null}
 */
export function parseAccountKeyword(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('@')) return null;
  const handle = trimmed.slice(1).trim();
  if (!handle) return null;
  // 当前只支持 B站（可扩展）
  return { platform: 'bilibili', handle };
}

/**
 * 创建一个虚拟账号识别源（用 BaseSource 协议）
 * @param {string} platform - 'bilibili'
 * @param {string} handle - 用户名（无 @ 前缀）
 */
export function createAccountSource(platform, handle) {
  const name = `account:${platform}:${handle.toLowerCase()}`;
  return defineSource(name, async () => {
    const resolver = resolvers[platform];
    if (!resolver) {
      console.warn(`[account-resolver] platform "${platform}" not supported`);
      return [];
    }
    return resolver(handle);
  }, { description: `账号识别 ${platform}:${handle}` });
}

/**
 * 平台级 resolver
 *  - bilibili: 搜索 UP主（search_type=user）
 */
const resolvers = {
  async bilibili(handle) {
    const params = new URLSearchParams({
      keyword: handle,
      search_type: 'user',
      page: '1',
      pagesize: '5',
      platform: 'pc',
      web_location: '1550101',
    });
    const url = `${BILI_SEARCH}?${params}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json',
    };
    if (config.bilibili.sessdata) {
      headers['Cookie'] = `SESSDATA=${config.bilibili.sessdata}`;
    }
    const json = await safeFetchJSON(url, { timeout: 15000, headers });
    if (json.code !== 0) {
      throw new Error(`bilibili-account code=${json.code} msg=${json.message || 'unknown'}`);
    }
    const result = json.data?.result || [];
    // B站实际 result_type='bili_user'
    const upResult = result.find(r =>
      r.result_type === 'bili_user' ||
      r.result_type === 'user' ||
      r.result_type === 'upuser'
    );
    const ulist = Array.isArray(upResult?.data) ? upResult.data : [];

    return ulist.map((u, idx) => {
      const fans = u.fans || 0;
      // 账号识别要求最低粉丝门槛（避免 0 粉同名号进库）
      if (fans < config.bilibili.minFollowers) return null;

      return {
        title: `👤 ${u.uname}`,
        url: `https://space.bilibili.com/${u.mid}`,
        content: (u.usign || u.official_desc || '').slice(0, 500),
        source_id: `account-bili-${u.mid}`,
        published_at: Date.now(),
        meta: {
          type: 'account',
          kind: 'account-resolution',
          is_up_master: true,
          is_account_resolution: true,    // 用于 UI 区分普通 UP主 vs 账号解析
          platform: 'bilibili',
          mid: u.mid,
          name: u.uname,
          fans,
          followers: fans,
          videos: u.videos || 0,
          sign: u.usign || '',
          face: u.upic || '',
          level: u.level || 0,
          rank: idx + 1,
          query_handle: handle,
          official_desc: u.official_desc || '',
          verify_info: u.verify_info || '',
        },
      };
    }).filter(Boolean);
  },
};

/**
 * 遍历所有启用关键词，返回账号类关键词
 */
export function listAccountKeywords(enabledKeywords) {
  return enabledKeywords
    .map(k => ({ kw: k, parsed: parseAccountKeyword(k.text) }))
    .filter(x => x.parsed !== null);
}