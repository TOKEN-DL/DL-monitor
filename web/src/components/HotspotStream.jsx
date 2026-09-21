import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter, RefreshCw, Radar, Sparkles, Archive, Activity, Layers, ArrowUp,
  Star, Flame, ChevronDown, BookmarkPlus, Bookmark, X, RotateCcw,
} from "lucide-react";
import { HotspotCard } from "./HotspotCard";
import { Chip } from "./ui/chip";
import { RangeSlider } from "./ui/range-slider";
import { cn, SOURCE_LABELS, getSourceLabel, qualityScore } from "../lib/utils";
import { keywordApi } from "../lib/api";
import { useViewPresets } from "../hooks/useViewPresets";

const ARCHIVE_MODES = [
  { value: "active", label: "活跃", icon: Activity, desc: "默认：仅显示 7 天内" },
  { value: "archived", label: "归档", icon: Archive, desc: "已归档但保留" },
  { value: "all", label: "全部", icon: Layers, desc: "活跃 + 归档" },
];

const SORT_MODES = [
  { value: "recent", label: "最新抓取", desc: "默认 · 按系统抓取时间" },
  { value: "published", label: "原文时间", desc: "按原文发布时间（不含 NULL）" },
  { value: "importance", label: "AI 重要度", desc: "按 AI 评估的重要度" },
  { value: "burst", label: "热度爆发率", desc: "每小时浏览量（vph）" },
];

const WINDOW_MODES = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
  { value: "all", label: "全部" },
];

export function HotspotStream({
  items,
  loading,
  filters,
  setFilter,
  toggleSource,
  toggleKeyword,
  toggleQuickTag,
  reset,
  applyFilters,
  sourceCounts = {},
  onTriggerRun,
  triggering,
  newIds,
}) {
  const { presets, savePreset, deletePreset } = useViewPresets();
  const [topPulse, setTopPulse] = useState(false);
  const [scrollState, setScrollState] = useState({ atTop: true, atBottom: false, scrollTop: 0 });
  const [sortOpen, setSortOpen] = useState(false);
  const [kwOpen, setKwOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [keywords, setKeywords] = useState([]);
  const listRef = useRef(null);
  const sortRef = useRef(null);
  const kwRef = useRef(null);
  const presetRef = useRef(null);

  // 拉取关键词列表（用于关键词 chips）
  useEffect(() => {
    keywordApi.list()
      .then((list) => setKeywords(list.filter((k) => k.enabled !== 0)))
      .catch(() => {});
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    const onClick = (e) => {
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (kwOpen && kwRef.current && !kwRef.current.contains(e.target)) setKwOpen(false);
      if (presetOpen && presetRef.current && !presetRef.current.contains(e.target)) setPresetOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [sortOpen, kwOpen, presetOpen]);

  // 当有新条目到达时顶部脉冲一下
  useEffect(() => {
    if (newIds.size > 0) {
      setTopPulse(true);
      const t = setTimeout(() => setTopPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [newIds.size]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop < 8;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 8;
    setScrollState((prev) => {
      if (prev.atTop === atTop && prev.atBottom === atBottom && prev.scrollTop === scrollTop) return prev;
      return { atTop, atBottom, scrollTop };
    });
  };

  const scrollToTop = (smooth = true) => {
    listRef.current?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  };

  const lastItemsLenRef = useRef(items.length);
  useEffect(() => {
    const prev = lastItemsLenRef.current;
    lastItemsLenRef.current = items.length;
    if (items.length > prev && scrollState.atTop) {
      requestAnimationFrame(() => scrollToTop(false));
    }
  }, [items.length, scrollState.atTop]);

  // 来源 chip 选项（动态合并：当前 items 来源 + count > 0 的来源 + 已选但无数据的来源）
  const sourceOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    // 1. 当前 items 出现过的来源（按当前筛选）
    for (const it of items) {
      if (it.source && !seen.has(it.source)) {
        seen.add(it.source);
        opts.push(it.source);
      }
    }
    // 2. count > 0 但当前 items 缺失的（如换筛选条件后该源有新数据）
    for (const [src, n] of Object.entries(sourceCounts)) {
      if (n > 0 && !seen.has(src)) {
        seen.add(src);
        opts.push(src);
      }
    }
    // 3. 已选但无数据的来源（避免选项消失）
    for (const src of filters.sources) {
      if (!seen.has(src)) {
        seen.add(src);
        opts.push(src);
      }
    }
    // 按常用顺序排序
    const order = ["hackernews", "github", "huggingface", "arxiv", "twitter", "bilibili", "google", "zhihu-trends", "weibo-trends"];
    return opts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [items, sourceCounts, filters.sources]);

  // 当前激活的来源计数
  const activeSourceCount = filters.sources.length;

  const currentSort = SORT_MODES.find((m) => m.value === filters.sort) || SORT_MODES[0];
  const currentWindow = filters.window || "7d";

  const handleSavePreset = () => {
    setSaveError("");
    try {
      const p = savePreset(presetName, filters);
      if (p) {
        setPresetName("");
        setSaveDialogOpen(false);
      }
    } catch (e) {
      setSaveError(e.message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] min-h-[500px]">
      {/* 第一行：标题 + 排序 + 视图 + 抓取 */}
      <div
        className={cn(
          "relative z-50 shrink-0 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-md px-3 py-2 mb-2 transition-all",
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
          {/* 排序下拉 */}
          <div ref={sortRef} className="relative">
            <button
              onClick={() => { setSortOpen((v) => !v); setKwOpen(false); setPresetOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all border",
                "border-slate-700/60 text-slate-300 hover:border-indigo-500/40"
              )}
              title={currentSort.desc}
            >
              <Filter className="w-3.5 h-3.5" />
              排序 · {currentSort.label}
              <ChevronDown className={cn("w-3 h-3 transition-transform", sortOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {sortOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-slate-700/60 bg-slate-900/95 backdrop-blur-md shadow-lg py-1"
                >
                  {SORT_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => { setFilter({ sort: m.value }); setSortOpen(false); }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-slate-800/80 transition-colors",
                        filters.sort === m.value ? "text-indigo-300" : "text-slate-300"
                      )}
                    >
                      <span>{m.label}</span>
                      {filters.sort === m.value && <span className="text-[10px] text-slate-500">✓</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 视图切换（活跃/归档/全部） */}
          <div className="flex items-center rounded-md border border-slate-700/60 bg-slate-900/60 p-0.5">
            {ARCHIVE_MODES.map((m) => {
              const Icon = m.icon;
              const active = (filters.archive || "active") === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => setFilter({ archive: m.value })}
                  title={m.desc}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                    active
                      ? m.value === "archived"
                        ? "bg-amber-500/20 text-amber-200"
                        : m.value === "all"
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

          {/* 立即抓取 */}
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

      {/* 第二行：筛选 + 一键标签 + 预设 */}
      <div className="relative z-50 shrink-0 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-md px-3 py-2 mb-3">
        {/* 来源 chips（F1 多选） */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-500 font-mono mr-1">来源</span>
          <Chip
            size="sm"
            active={filters.sources.length === 0}
            onClick={() => setFilter({ sources: [] })}
            title="清除来源过滤，显示所有"
          >
            全部
          </Chip>
          {sourceOptions.map((src) => (
            <Chip
              key={src}
              size="sm"
              active={filters.sources.includes(src)}
              onClick={() => toggleSource(src)}
              count={sourceCounts[src]}
              tone={filters.sources.includes(src) ? "accent" : "default"}
              title={SOURCE_LABELS[src] || src}
            >
              {getSourceLabel(src)}
            </Chip>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-700/60" />

        {/* 时间窗 chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-mono mr-1">时间</span>
          {WINDOW_MODES.map((w) => (
            <Chip
              key={w.value}
              size="sm"
              active={currentWindow === w.value}
              onClick={() => setFilter({ window: w.value })}
            >
              {w.label}
            </Chip>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-700/60" />

        {/* 重要度双滑块 */}
        <RangeSlider
          label="重要度"
          min={0}
          max={1}
          step={0.05}
          value={[filters.minImportance ?? 0, filters.maxImportance ?? 1]}
          onChange={([lo, hi]) => setFilter({ minImportance: lo, maxImportance: hi })}
          format={(v) => v.toFixed(2)}
        />

        <div className="h-4 w-px bg-slate-700/60" />

        {/* 一键标签 */}
        <div className="flex items-center gap-1.5">
          <Chip
            size="sm"
            tone="kol"
            active={filters.quickTags.includes("kol")}
            onClick={() => toggleQuickTag("kol")}
            icon={Star}
            title="只看白名单 KOL（跨源）"
          >
            KOL
          </Chip>
          <Chip
            size="sm"
            tone="burst"
            active={filters.quickTags.includes("burst")}
            onClick={() => toggleQuickTag("burst")}
            icon={Flame}
            title="只看爆款（Twitter 10w+ / B站 5w+ / GitHub 500+ stars / HN score 200+ / HF 1k+ 下载）"
          >
            爆款
          </Chip>
        </div>

        <div className="h-4 w-px bg-slate-700/60" />

        {/* 关键词多选（F2） */}
        <div ref={kwRef} className="relative">
          <button
            onClick={() => { setKwOpen((v) => !v); setSortOpen(false); setPresetOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all border",
              filters.keywords.length
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-200"
                : "border-slate-700/60 text-slate-300 hover:border-slate-500"
            )}
            title="仅显示命中下列关键词中任一的热点"
          >
            <Sparkles className="w-3.5 h-3.5" />
            关键词{filters.keywords.length > 0 ? ` · ${filters.keywords.length}` : ""}
            <ChevronDown className={cn("w-3 h-3 transition-transform", kwOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {kwOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-1 z-50 min-w-[220px] max-h-[280px] overflow-y-auto rounded-md border border-slate-700/60 bg-slate-900/95 backdrop-blur-md shadow-lg p-2"
              >
                {keywords.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-2 text-center">暂无启用关键词</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map((k) => (
                      <Chip
                        key={k.id}
                        size="sm"
                        tone="accent"
                        active={filters.keywords.includes(k.text)}
                        onClick={() => toggleKeyword(k.text)}
                      >
                        #{k.text}
                      </Chip>
                    ))}
                  </div>
                )}
                {filters.keywords.length > 0 && (
                  <button
                    onClick={() => setFilter({ keywords: [] })}
                    className="mt-2 w-full text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    清除选择
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 清除所有筛选 */}
          <button
            onClick={reset}
            title="清空来源/关键词/重要度/一键标签（保留排序/视图）"
            className="flex items-center gap-1 rounded-md border border-slate-700/60 px-2 py-1 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            <RotateCcw className="w-3 h-3" />
            清空
          </button>

          {/* 保存 / 加载预设（C1+C2） */}
          <div ref={presetRef} className="relative">
            <button
              onClick={() => { setPresetOpen((v) => !v); setSortOpen(false); setKwOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all border",
                presets.length
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                  : "border-slate-700/60 text-slate-300 hover:border-slate-500"
              )}
              title={`已保存 ${presets.length} 个预设（上限 20）`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              预设 · {presets.length}
              <ChevronDown className={cn("w-3 h-3 transition-transform", presetOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {presetOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-md border border-slate-700/60 bg-slate-900/95 backdrop-blur-md shadow-lg p-2"
                >
                  {/* 保存当前 */}
                  <button
                    onClick={() => { setSaveDialogOpen(true); setPresetOpen(false); }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800/80"
                  >
                    <BookmarkPlus className="w-3 h-3 text-violet-300" />
                    保存当前筛选为预设…
                  </button>
                  <div className="my-1 h-px bg-slate-800" />
                  {presets.length === 0 ? (
                    <div className="text-[10px] text-slate-500 py-2 text-center">暂无预设</div>
                  ) : (
                    <div className="space-y-0.5">
                      {presets.map((p) => (
                        <div
                          key={p.id}
                          className="group flex items-center justify-between rounded px-2 py-1 hover:bg-slate-800/80"
                        >
                          <button
                            onClick={() => { applyFilters(p.filters); setPresetOpen(false); }}
                            className="flex-1 text-left text-[11px] text-slate-300 truncate"
                            title={`${new Date(p.createdAt).toLocaleString("zh-CN")}`}
                          >
                            {p.name}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(`删除预设「${p.name}」？`)) deletePreset(p.id); }}
                            className="ml-1 rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 opacity-0 group-hover:opacity-100"
                            title="删除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 保存预设对话框 */}
      <AnimatePresence>
        {saveDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSaveDialogOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-[320px] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-semibold text-slate-100 mb-2">保存为预设</div>
              <input
                autoFocus
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }}
                placeholder="例如：只看 KOL Twitter"
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-400 focus:outline-none"
                maxLength={40}
              />
              {saveError && (
                <div className="mt-2 text-[11px] text-rose-300">⚠ {saveError}</div>
              )}
              <div className="mt-2 text-[10px] text-slate-500">
                当前筛选将保存（含排序/来源/关键词/重要度等）
              </div>
              <div className="mt-3 flex gap-2 justify-end">
                <button
                  onClick={() => setSaveDialogOpen(false)}
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleSavePreset}
                  className="rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-xs font-medium text-white hover:from-indigo-400 hover:to-violet-400"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 列表（独立滚动区） */}
      <div className="relative z-0 flex-1 min-h-0">
        <div
          className={cn(
            "pointer-events-none absolute top-0 left-0 right-0 z-10 h-10 bg-gradient-to-b from-slate-950/95 to-transparent transition-opacity duration-300",
            scrollState.atTop ? "opacity-0" : "opacity-100"
          )}
          aria-hidden
        />
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
                <p className="mt-1 text-xs text-slate-600">调整筛选条件或点击「立即抓取」</p>
              </motion.div>
            )}

            {items.map((h) => (
              <HotspotCard key={h.id} h={h} isNew={newIds.has(h.id)} />
            ))}
          </AnimatePresence>

          {loading && items.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
              ))}
            </div>
          )}

          <div className="h-2 shrink-0" aria-hidden />
        </div>

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