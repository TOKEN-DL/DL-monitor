import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, RefreshCw, Radar } from "lucide-react";
import { HotspotCard } from "./HotspotCard";
import { cn, SOURCE_LABELS } from "../lib/utils";

const SOURCES = [
  { value: "", label: "全部来源" },
  { value: "hackernews", label: "HackerNews" },
  { value: "github", label: "GitHub" },
  { value: "huggingface", label: "HuggingFace" },
  { value: "arxiv", label: "arXiv" },
  { value: "twitter", label: "X(Twitter)" },
];

export function HotspotStream({
  items,
  loading,
  filters,
  setFilter,
  onRefresh,
  onTriggerRun,
  triggering,
  newIds,
}) {
  const [topPulse, setTopPulse] = useState(false);

  // 当有新条目到达时顶部脉冲一下
  useEffect(() => {
    if (newIds.size > 0) {
      setTopPulse(true);
      const t = setTimeout(() => setTopPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [newIds.size]);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-md px-3 py-2 transition-all",
          topPulse && "ring-2 ring-indigo-400/40 shadow-glow"
        )}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Radar className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-slate-200">实时热点流</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono">{items.length} 条</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={filters.source}
              onChange={(e) => setFilter({ source: e.target.value })}
              className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onTriggerRun}
            disabled={triggering}
            className="flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:from-indigo-500/40 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", triggering && "animate-spin")} />
            {triggering ? "扫描中…" : "立即抓取"}
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="space-y-3 overflow-safe">
        <AnimatePresence mode="popLayout">
          {items.length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="mb-4 grid h-20 w-20 place-items-center rounded-full border border-slate-700 border-t-indigo-400 border-r-violet-400"
              >
                <Radar className="w-7 h-7 text-indigo-400" />
              </motion.div>
              <p className="text-sm text-slate-400">雷达静默中…等待信号</p>
              <p className="mt-1 text-xs text-slate-600">添加关键词后开始扫描</p>
            </motion.div>
          )}

          {items.map((h) => (
            <HotspotCard
              key={h.id}
              h={h}
              isNew={newIds.has(h.id)}
            />
          ))}
        </AnimatePresence>

        {loading && items.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}