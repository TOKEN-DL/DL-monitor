// 微博热搜源（占位实现，默认禁用）
// 已知：m.weibo.cn API 在未登录状态返回 432 风控；web 端 302 → 404
// RSSHub 公共实例在本网络不可达；第三方聚合 API 同样不可达
// 唯一可行路径：用户自部署 RSSHub 实例并配置 WEIBO_TRENDS_RSSHUB_URL 环境变量
//
// 当前实现：返回空数组，作为架构扩展点保留
import { defineSource } from './base.js';
import { safeFetchText } from './base.js';

export function weiboTrends() {
  return defineSource('weibo-trends', async () => {
    const rsshubBase = process.env.WEIBO_TRENDS_RSSHUB_URL;
    if (!rsshubBase) {
      console.warn('[source:weibo-trends] 未配置 WEIBO_TRENDS_RSSHUB_URL，跳过（占位实现）');
      return [];
    }

    // 当用户配置了 RSSHub 实例时启用：
    // 端点示例：${rsshubBase}/weibo/search/hot
    try {
      const xml = await safeFetchText(`${rsshubBase.replace(/\/$/, '')}/weibo/search/hot`, {
        timeout: 15000,
        headers: { 'User-Agent': 'DL-monitor/0.1' },
      });
      // 解析 RSS（简单实现：直接返回标题链接）
      const items = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const block = m[1];
        const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const desc = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
        const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
        if (title && link) {
          items.push({
            title: stripTags(title).trim(),
            url: link.trim(),
            content: stripTags(desc).slice(0, 500),
            source_id: link.trim(),
            published_at: pubDate ? Date.parse(pubDate) : Date.now(),
            meta: {
              type: 'trend-keyword',
              platform: 'weibo',
            },
          });
        }
      }
      return items;
    } catch (e) {
      console.warn(`[source:weibo-trends] RSSHub fetch failed:`, e.message);
      return [];
    }
  }, { description: '微博热搜（需 RSSHub 实例，默认禁用）' });
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}