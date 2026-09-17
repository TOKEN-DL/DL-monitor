// 各源的质量过滤逻辑（信号强度把关）
// 设计：每源独立过滤函数；返回 { items, dropped, stats } 让上层汇报
//   - items: 过滤后的项
//   - dropped: 被过滤的项数（写入 source_status.last_filtered）
//   - stats: 每条规则的命中数（便于调试）
//
// 所有过滤函数都遵循纯函数风格：输入不修改原对象

/**
 * Twitter 过滤（三层防线 + 转发/引用/回复多重拦截）
 * 抓取目标：原作者发布的原创推文
 * 排除：
 *   - retweet（纯转发，retweeted_tweet 存在）
 *   - quote tweet（引用推文，quoted_tweet 存在）
 *   - reply（回复，isReply=true 或 inReplyToId 存在）
 *   - 文本兜底："RT @xxx" 开头的纯转发
 *
 * @param {Array} items - 已标准化为 {title, url, content, source_id, published_at, meta} 的项
 * @param {Object} opts
 * @param {number} opts.minFollowers - 粉丝阈值
 * @param {number} opts.minViews - 浏览量阈值
 * @param {number} opts.windowHours - 时间窗（小时）
 * @param {Set<string>} opts.whitelistHandles - 白名单 handle 集合（lowercase, 不带@）
 * @returns {{items: Array, dropped: number, stats: object}}
 */
export function filterTwitter(items, opts) {
  const { minFollowers = 5000, minViews = 2000, windowHours = 6, whitelistHandles = new Set() } = opts || {};
  const windowMs = windowHours * 3600 * 1000;
  const cutoff = Date.now() - windowMs;

  const stats = {
    whitelist: 0,
    byTime: 0,
    byReply: 0,
    byRetweet: 0,
    byQuote: 0,
    byRtText: 0,
    byFollowers: 0,
    byViews: 0,
    kept: 0,
  };
  const kept = [];

  for (const it of items) {
    const meta = it.meta || {};
    const handle = String(meta.handle || '').toLowerCase();
    const isWhite = whitelistHandles.has(handle);

    // 规则1：白名单 → 标记后跳过粉丝/浏览阈值，但仍保留时间窗
    // 白名单作者也可能发引用/回复，这些仍要过滤（只保留原创推文）
    if (isWhite) {
      meta.whitelisted = true;
      stats.whitelist++;
    }

    // 规则2：时间窗（published_at 必须存在且在窗口内）
    const ts = it.published_at;
    if (!ts || ts < cutoff) {
      stats.byTime++;
      continue;
    }

    // 规则3：回复过滤（API 标记 isReply + inReplyToId 兜底）
    if (meta.isReply === true || (meta.inReplyToId && meta.inReplyToId !== meta.source_id)) {
      stats.byReply++;
      continue;
    }

    // 规则4：纯转发过滤（retweeted_tweet 字段存在 → 是转发）
    if (meta.isRetweet === true || meta.hasRetweetedTweet === true) {
      stats.byRetweet++;
      continue;
    }

    // 规则5：引用推文过滤（quoted_tweet 存在 → 用户发新内容但引用了别人）
    if (meta.isQuote === true || meta.hasQuotedTweet === true) {
      stats.byQuote++;
      continue;
    }

    // 规则6：文本兜底（API 没标记但文本以 "RT @" 开头）
    const text = String(it.title || it.content || '');
    if (meta.startsWithRt === true || /^RT\s+@/i.test(text)) {
      stats.byRtText++;
      continue;
    }

    // 规则7：粉丝阈值（非白名单才检查）
    if (!isWhite && (meta.followers || 0) < minFollowers) {
      stats.byFollowers++;
      continue;
    }

    // 规则8：浏览量阈值（非白名单才检查）
    if (!isWhite && (meta.views || 0) < minViews) {
      stats.byViews++;
      continue;
    }

    kept.push(it);
    stats.kept++;
  }

  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * HackerNews 过滤（score + descendants）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.minScore
 * @param {number} opts.minDescendants
 * @param {number} opts.windowHours
 */
export function filterHackernews(items, opts) {
  const { minScore = 50, minDescendants = 20, windowHours = 24 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, byScore: 0, byDescendants: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    const ts = it.published_at;
    if (!ts || ts < cutoff) { stats.byTime++; continue; }
    const meta = it.meta || {};
    if ((meta.score || 0) < minScore) { stats.byScore++; continue; }
    if ((meta.descendants || 0) < minDescendants) { stats.byDescendants++; continue; }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * GitHub 过滤（stars）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.minStars
 * @param {number} opts.windowHours
 */
export function filterGithub(items, opts) {
  const { minStars = 200, windowHours = 24 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, byStars: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    const ts = it.published_at;
    if (!ts || ts < cutoff) { stats.byTime++; continue; }
    const meta = it.meta || {};
    if ((meta.stars || 0) < minStars) { stats.byStars++; continue; }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * HuggingFace 过滤（downloads）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.minDownloads
 * @param {number} opts.windowHours
 */
export function filterHuggingface(items, opts) {
  const { minDownloads = 1000, windowHours = 168 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, byDownloads: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    // 只对模型过滤（论文不强制）
    const meta = it.meta || {};
    if (meta.kind === 'model') {
      const ts = it.published_at;
      if (!ts || ts < cutoff) { stats.byTime++; continue; }
      if ((meta.downloads || 0) < minDownloads) { stats.byDownloads++; continue; }
    }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * arXiv 过滤（仅时间窗，无浏览量）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.windowHours
 */
export function filterArxiv(items, opts) {
  const { windowHours = 168 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    const ts = it.published_at;
    if (!ts || ts < cutoff) { stats.byTime++; continue; }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * B站过滤（播放 + 粉丝）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.minPlays
 * @param {number} opts.minFollowers
 * @param {number} opts.windowHours
 */
export function filterBilibili(items, opts) {
  const { minPlays = 2000, minFollowers = 5000, windowHours = 6 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, byPlays: 0, byFollowers: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    const ts = it.published_at;
    if (!ts || ts < cutoff) { stats.byTime++; continue; }
    const meta = it.meta || {};
    if ((meta.plays || 0) < minPlays) { stats.byPlays++; continue; }
    if ((meta.followers || 0) < minFollowers) { stats.byFollowers++; continue; }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}

/**
 * Google News RSS 过滤（仅时间窗，无浏览量代理）
 * @param {Array} items
 * @param {Object} opts
 * @param {number} opts.windowHours
 */
export function filterGoogle(items, opts) {
  const { windowHours = 6 } = opts || {};
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const stats = { byTime: 0, kept: 0 };
  const kept = [];
  for (const it of items) {
    const ts = it.published_at;
    if (!ts || ts < cutoff) { stats.byTime++; continue; }
    kept.push(it);
    stats.kept++;
  }
  return { items: kept, dropped: items.length - kept.length, stats };
}