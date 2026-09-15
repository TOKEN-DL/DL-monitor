import { motion } from "framer-motion";
import { ExternalLink, Flame, Sparkles } from "lucide-react";
import { TextGenerateEffect } from "./ui/text-generate-effect";
import { SOURCE_LABELS, cn, timeAgo } from "../lib/utils";

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
  const sourceLabel = SOURCE_LABELS[sourceKey] || h.source;
  const isCritical = imp >= 0.85;
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
        isCritical
          ? "border-rose-500/50 critical-pulse"
          : "border-slate-800/60 hover:border-indigo-400/40"
      )}
    >
      {/* 渐变背景 */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity",
          isCritical
            ? "bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-transparent"
            : "bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-transparent"
        )}
      />

      <div className="relative p-4 space-y-3">
        {/* meta 行 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">{sourceLabel}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono">{timeAgo(h.fetched_at)}</span>
            {h.published_at && h.published_at !== h.fetched_at && (
              <span className="text-[10px] text-slate-600 font-mono">
                · 发布 {timeAgo(h.published_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isCritical && (
              <span className="flex items-center gap-0.5 rounded-md bg-rose-500/20 px-1.5 py-0.5 text-rose-300 text-[10px] font-semibold uppercase">
                <Flame className="w-3 h-3" />
                重要
              </span>
            )}
            <span className="font-mono text-slate-400">
              <span className="text-slate-500">imp</span>{" "}
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

        {/* 标题 */}
        <h3 className="text-[15px] font-semibold leading-snug text-slate-100 group-hover:text-white transition-colors">
          {h.title}
        </h3>

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
            原文
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </motion.article>
  );
}