import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, RefreshCw, Radar, Sparkles, Archive, Activity, Layers, ArrowUp } from "lucide-react";
import { HotspotCard } from "./HotspotCard";
import { cn, SOURCE_LABELS, getSourceLabel, qualityScore } from "../lib/utils";

const ARCHIVE_MODES = [
  { value: "active", label: "活跃", icon: Activity, desc: "默认：仅显示 7 天内" },
  { value: "archived", label: "归档", icon: Archive, desc: "已归档但保留" },
  { value: "all", label: "全部", icon: Layers, desc: "活跃 + 归档" },
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
  const [qualityOnly, setQualityOnly] = useState(false);
  const [scrollState, setScrollState] = useState({ atTop: true, atBottom: false, scrollTop: 0 });
  const listRef = useRef(null);

  // 当有新条目到达时顶部脉冲一下
  useEffect(() => {
    if (newIds.size > 0) {
      setTopPulse(true);
      const t = setTimeout(() => setTopPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [newIds.size]);

  // 跟踪列表滚动位置，用于显示遮罩 + 回顶按钮
  const handleScroll = (e) => {
    const el = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop < 8;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 8;
    setScrollState((prev) => {
      if (prev.atTop === atTop && prev.atBottom === atBottom && prev.scrollTop === scrollTop) {
        return prev;
      }
      return { atTop, atBottom, scrollTop };
    });
  };

  // 回顶按钮
  const scrollToTop = (smooth = true) => {
    listRef.current?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  };

  // 新条目到达时自动滚到顶部（但仅当用户已经位于顶部时，避免打扰正在浏览的历史）
  const lastItemsLenRef = useRef(items.length);
  useEffect(() => {
    const prev = lastItemsLenRef.current;
    lastItemsLenRef.current = items.length;
    if (items.length > prev && scrollState.atTop) {
      // 用户在顶部，新条目 prepend 后列表自然把新条目展示在顶部，无需滚动
      // 但由于容器可能滚动出视图，需要确保 scrollTop = 0
      requestAnimationFrame(() => scrollToTop(false));
    }
  }, [items.length, scrollState.atTop]);

  // 本地排序：质量优先 vs 默认（importance）
  const sortedItems = useMemo(() => {
    if (!qualityOnly) return items;
    return [...items].sort((a, b) => qualityScore(b) - qualityScore(a));
  }, [items, qualityOnly]);

  // 动态来源下拉：从当前 items 里提取实际存在的 source（确保禁用源不会出现）
  const sourceOptions = useMemo(() => {
    const seen = new Set();
    const opts = [{ value: "", label: "全部来源" }];
    for (const it of items) {
      const key = it.source;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      opts.push({ value: key, label: getSourceLabel(key) });
    }
    // 当前过滤值若不在列表里，仍要保留（避免选项消失导致 UI 卡住）
    if (filters.source && !seen.has(filters.source)) {
      opts.push({ value: filters.source, label: `${getSourceLabel(filters.source)}（无数据）` });
    }
    return opts;
  }, [items, filters.source]);

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] min-h-[500px]">
      {/* 工具栏（固定不滚动） */}
      <div
        className={cn(
          "shrink-0 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-md px-3 py-2 mb-3 transition-all",
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
          {/* 保留策略切换（活跃 / 归档 / 全部） */}
          <div className="flex items-center rounded-md border border-slate-700/60 bg-slate-900/60 p-0.5">
            {ARCHIVE_MODES.map((m) => {
              const Icon = m.icon;
              const active = (filters.archive || 'active') === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => setFilter({ archive: m.value })}
                  title={m.desc}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                    active
                      ? m.value === 'archived'
                        ? "bg-amber-500/20 text-amber-200"
                        : m.value === 'all'
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-indigo-500/20 text-indigo-200"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setQualityOnly(!qualityOnly)}
            title="按综合质量分排序（importance × 70% + 浏览/粉丝等 × 30%）"
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all border",
              qualityOnly
                ? "border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-200"
                : "border-slate-700/60 text-slate-400 hover:border-slate-500"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {qualityOnly ? "高质量优先" : "默认排序"}
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={filters.source}
              onChange={(e) => setFilter({ source: e.target.value })}
              className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
            >
              {sourceOptions.map((s) => (
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

      {/* 列表（独立滚动区） */}
      <div className="relative flex-1 min-h-0">
        {/* 顶部渐变遮罩（提示可下滚） */}
        <div
          className={cn(
            "pointer-events-none absolute top-0 left-0 right-0 z-10 h-10 bg-gradient-to-b from-slate-950/95 to-transparent transition-opacity duration-300",
            scrollState.atTop ? "opacity-0" : "opacity-100"
          )}
          aria-hidden
        />
        {/* 底部渐变遮罩（提示可上滚） */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-10 bg-gradient-to-t from-slate-950/95 to-transparent transition-opacity duration-300",
            scrollState.atBottom ? "opacity-0" : "opacity-100"
          )}
          aria-hidden
        />

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overflow-x-hidden pr-1 space-y-3 scroll-smooth scrollbar-thin"
          style={{ scrollbarGutter: "stable" }}
        >
          <AnimatePresence mode="popLayout">
            {sortedItems.length === 0 && !loading && (
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

            {sortedItems.map((h) => (
              <HotspotCard
                key={h.id}
                h={h}
                isNew={newIds.has(h.id)}
              />
            ))}
          </AnimatePresence>

          {loading && sortedItems.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40"
                />
              ))}
            </div>
          )}

          {/* 底部占位，确保最后一项可滚到顶 */}
          <div className="h-2 shrink-0" aria-hidden />
        </div>

        {/* 回顶按钮（滚动离开顶部时浮现） */}
        <AnimatePresence>
          {!scrollState.atTop && (
            <motion.button
              key="back-to-top"
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={() => scrollToTop(true)}
              title="回到顶部（显示最新热点）"
              className="absolute bottom-4 right-4 z-20 grid place-items-center w-10 h-10 rounded-full border border-indigo-500/40 bg-indigo-500/20 backdrop-blur-md text-indigo-200 shadow-lg hover:bg-indigo-500/40 hover:text-white transition-colors"
            >
              <ArrowUp className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}