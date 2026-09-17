import { motion } from "framer-motion";
import { ExternalLink, Flame, Sparkles, BadgeCheck, User, Eye, AlertTriangle, Archive } from "lucide-react";
import { TextGenerateEffect } from "./ui/text-generate-effect";
import { SOURCE_LABELS, getSourceLabel, cn, timeAgo, formatCount } from "../lib/utils";

const IMPORTANCE_FILL = [
  "bg-slate-600",
  "bg-slate-500",
  "bg-cyan-600",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-rose-500",
];

export function HotspotCard({ h, isNew = false }) {
  const imp = h.ai_importance ?? 0.5;
  const score = h.ai_score ?? 0;
  const sourceKey = h.source || "twitter";
  const sourceLabel = getSourceLabel(sourceKey);
  const isCritical = imp >= 0.85;
  const isWhitelisted = h.meta?.whitelisted === true;
  const isAccount = h.meta?.is_account_resolution === true;
  const isArchived = !!h.archived_at;
  const matched = Array.isArray(h.matched_keywords)
    ? h.matched_keywords
    : (() => {
        try {
          return JSON.parse(h.matched_keywords || "[]");
        } catch {
          return [];
        }
      })();
  const summary = h.ai_summary || "";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-gray-900/60 backdrop-blur-sm transition-all",
        isArchived
          ? "border-amber-700/40 opacity-80"
          : isAccount
          ? "border-pink-500/40 hover:border-pink-400/60"
          : isCritical
          ? "border-rose-500/50 critical-pulse"
          : "border-slate-800/60 hover:border-indigo-400/40"
      )}
    >
      {/* 账号识别左侧粉色条 */}
      {isAccount && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-pink-300 via-pink-400 to-fuchsia-500" />
      )}
      {/* 白名单左侧金色条 */}
      {!isAccount && isWhitelisted && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500" />
      )}

      {/* 渐变背景 */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity",
          isAccount
            ? "bg-gradient-to-br from-pink-500/10 via-fuchsia-500/5 to-transparent"
            : isCritical
            ? "bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-transparent"
            : "bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-transparent"
        )}
      />

      <div className="relative p-4 space-y-3">
        {/* meta 行 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("font-semibold", isAccount ? "text-pink-300" : "text-slate-300")}>
              {sourceLabel}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono">{timeAgo(h.fetched_at)}</span>
            {h.published_at && h.published_at !== h.fetched_at && (
              <span className="text-[10px] text-slate-600 font-mono">
                · 发布 {timeAgo(h.published_at)}
              </span>
            )}
            <SignalBadges h={h} />
          </div>
          <div className="flex items-center gap-1.5">
            {isArchived && (
              <span className="flex items-center gap-0.5 rounded-md bg-amber-700/20 px-1.5 py-0.5 text-amber-300 text-[10px] font-semibold uppercase border border-amber-700/30">
                <Archive className="w-3 h-3" />
                已归档
              </span>
            )}
            {isAccount && (
              <span className="flex items-center gap-0.5 rounded-md bg-pink-500/20 px-1.5 py-0.5 text-pink-300 text-[10px] font-semibold uppercase border border-pink-500/30">
                <User className="w-3 h-3" />
                博主
              </span>
            )}
            {isWhitelisted && (
              <span className="flex items-center gap-0.5 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-amber-300 text-[10px] font-semibold uppercase border border-amber-500/30">
                KOL
              </span>
            )}
            {isCritical && (
              <span className="flex items-center gap-0.5 rounded-md bg-rose-500/20 px-1.5 py-0.5 text-rose-300 text-[10px] font-semibold uppercase">
                <Flame className="w-3 h-3" />
                重要
              </span>
            )}
            <span
              className="font-mono text-slate-400"
              title={`AI 评估的重要度评分（0-1，≥0.85 视为关键热点）：${imp.toFixed(2)}`}
            >
              <span className="text-slate-500">重要度</span>{" "}
              <span className={isCritical ? "text-rose-300" : "text-indigo-300"}>
                {imp.toFixed(2)}
              </span>
            </span>
            <div className="h-1.5 w-12 rounded-full bg-slate-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${imp * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={cn(
                  "h-full rounded-full",
                  IMPORTANCE_FILL[Math.floor(imp * 9)]
                )}
              />
            </div>
          </div>
        </div>

        {/* 账号识别特殊布局：头像 + 名称 + 签名 */}
        {isAccount ? (
          <AccountHeader meta={h.meta} />
        ) : null}

        {/* 标题（账号识别时 meta 已显示 UP 名，可省略；其他情况显示标题） */}
        {!isAccount && (
          <h3
            className="text-[15px] font-semibold leading-snug text-slate-100 group-hover:text-white transition-colors"
            title={h.title_zh && h.title_zh !== h.title ? `原文: ${h.title}` : undefined}
          >
            {h.title_zh || h.title}
          </h3>
        )}

        {/* 摘要（仅新条目或 imp >= 0.5 时用 TextGenerateEffect） */}
        {summary ? (
          isNew && imp >= 0.6 ? (
            <div className="text-sm leading-relaxed text-slate-300/90">
              <TextGenerateEffect words={summary} duration={0.35} />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-slate-300/90">{summary}</p>
          )
        ) : (
          <p className="text-sm leading-relaxed text-slate-500 italic">无摘要</p>
        )}

        {/* 关键词 + 链接 */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {matched.length > 0 ? (
              matched.map((kw) => (
                <span
                  key={kw}
                  className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-medium text-indigo-300"
                >
                  #{kw}
                </span>
              ))
            ) : score > 0 ? (
              <span className="rounded-md border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[11px] text-slate-400">
                命中 · {score.toFixed(2)}
              </span>
            ) : null}
            {isNew && (
              <span className="flex items-center gap-1 rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                <Sparkles className="w-3 h-3" />
                新
              </span>
            )}
          </div>
          <a
            href={h.url}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-300 transition-colors"
          >
            {isAccount ? "UP 主页" : "原文"}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </motion.article>
  );
}

/**
 * 账号识别头部布局：头像 + 名称 + 签名 + 粉丝数
 */
function AccountHeader({ meta }) {
  if (!meta) return null;
  const face = meta.face ? (meta.face.startsWith('//') ? `https:${meta.face}` : meta.face) : null;
  return (
    <div className="flex items-start gap-3">
      {face ? (
        <img
          src={face}
          alt={meta.name || 'avatar'}
          className="w-12 h-12 rounded-full border-2 border-pink-500/40 bg-slate-800 object-cover shrink-0"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-pink-500/20 grid place-items-center text-pink-300 text-lg font-semibold shrink-0">
          {(meta.name || '?').slice(0, 1)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-slate-100 truncate">
            {meta.name || '(未命名)'}
          </span>
          {meta.verify_info && (
            <span className="flex items-center gap-0.5 text-sky-400" title={meta.verify_info}>
              <BadgeCheck className="w-3.5 h-3.5" />
            </span>
          )}
          {meta.level ? (
            <span className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
              Lv{meta.level}
            </span>
          ) : null}
          {meta.official_desc ? (
            <span className="rounded-md bg-pink-500/20 px-1.5 py-0.5 text-[10px] text-pink-300 border border-pink-500/30">
              {meta.official_desc}
            </span>
          ) : null}
        </div>
        {meta.sign ? (
          <p className="text-[12px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {meta.sign}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 信号徽章：把每源的"权威信号"渲染成灰色 chip
 * Twitter: followers / views
 * B站: 粉丝 / 播放（视频） 或 粉丝 / 视频数（UP主）
 * 账号识别（account:*）：粉丝 / 视频数 / 查询关键词
 * GitHub: stars
 * HN: score
 * HF: downloads
 * Google: 来源媒体
 * 知乎热搜词：排名 / 热搜词
 */
function SignalBadges({ h }) {
  const meta = h.meta || {};
  const source = h.source;
  const items = [];

  // 账号识别虚拟源（account:bilibili:xxx）
  if (typeof source === 'string' && source.startsWith('account:')) {
    if (meta.fans) items.push(<SignalChip key="f" label="粉丝" value={formatCount(meta.fans)} highlight />);
    if (meta.videos) items.push(<SignalChip key="v" label="视频" value={meta.videos} />);
    if (meta.query_handle) items.push(<SignalChip key="h" label={`@${meta.query_handle}`} />);
    return items;
  }

  if (source === 'twitter') {
    if (meta.isBlueVerified || meta.isVerified) {
      items.push(
        <span key="v" className="flex items-center gap-0.5 text-sky-400" title="官方认证">
          <BadgeCheck className="w-3.5 h-3.5" />
        </span>
      );
    }
    if (meta.followers) items.push(<SignalChip key="f" label="粉丝" value={formatCount(meta.followers)} />);
    // 浏览量是核心指标：突出显示 + Eye 图标
    if (meta.views) {
      items.push(<ViewsChip key="v2" views={meta.views} />);
    } else if (meta.likes) {
      items.push(<SignalChip key="l" label="点赞" value={formatCount(meta.likes)} />);
    }
  } else if (source === 'bilibili') {
    if (meta.is_up_master) {
      if (meta.fans) items.push(<SignalChip key="f" label="UP粉" value={formatCount(meta.fans)} highlight />);
      if (meta.videos) items.push(<SignalChip key="v" label="视频" value={meta.videos} />);
    } else {
      if (meta.followers) items.push(<SignalChip key="f" label="UP粉" value={formatCount(meta.followers)} />);
      if (meta.plays) items.push(<SignalChip key="p" label="播放" value={formatCount(meta.plays)} highlight />);
    }
  } else if (source === 'github') {
    if (meta.stars) items.push(<SignalChip key="s" label="⭐" value={formatCount(meta.stars)} highlight />);
  } else if (source === 'hackernews') {
    if (meta.score) items.push(<SignalChip key="s" label="score" value={meta.score} highlight />);
    if (meta.descendants) items.push(<SignalChip key="d" label="评论" value={meta.descendants} />);
  } else if (source === 'huggingface') {
    if (meta.downloads) items.push(<SignalChip key="d" label="下载" value={formatCount(meta.downloads)} />);
    if (meta.likes) items.push(<SignalChip key="l" label="like" value={formatCount(meta.likes)} />);
  } else if (source === 'google') {
    if (meta.source_news) items.push(<SignalChip key="n" label={meta.source_news} />);
  } else if (source === 'arxiv') {
    if (Array.isArray(meta.authors) && meta.authors.length) {
      items.push(<SignalChip key="a" label="作者" value={meta.authors[0]} />);
    }
  } else if (source === 'zhihu-trends') {
    if (meta.rank) items.push(<SignalChip key="r" label="排名" value={`#${meta.rank}`} highlight />);
    if (meta.query) items.push(<SignalChip key="q" label={meta.query} />);
  } else if (source === 'weibo-trends') {
    items.push(<SignalChip key="t" label="微博热搜" />);
  }

  return items;
}

function SignalChip({ label, value, highlight }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-mono",
        highlight
          ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
          : "bg-slate-800/60 text-slate-400 border border-slate-700/40"
      )}
      title={`${label}${value !== undefined ? `: ${value}` : ''}`}
    >
      <span className="text-slate-500">{label}</span>
      {value !== undefined && <span className="ml-1 text-slate-200">{value}</span>}
    </span>
  );
}

/**
 * 浏览量专用 chip（Twitter 核心指标）
 * - 始终突出：Eye 图标 + 渐变背景 + 较大字号
 * - 低浏览量（< 2000）：显示橙色警告
 * - 高浏览量（>= 10w）：显示绿色"爆款"标记
 */
function ViewsChip({ views }) {
  const isLow = views > 0 && views < 2000;
  const isHot = views >= 100000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold border",
        isLow
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : isHot
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
      )}
      title={`浏览量: ${views.toLocaleString()}`}
    >
      {isLow ? (
        <AlertTriangle className="w-3 h-3" />
      ) : (
        <Eye className="w-3 h-3" />
      )}
      <span className="text-slate-400 font-normal">浏览</span>
      <span className={cn(isLow ? "text-amber-100" : isHot ? "text-emerald-100" : "text-cyan-100")}>
        {formatCount(views)}
      </span>
    </span>
  );
}