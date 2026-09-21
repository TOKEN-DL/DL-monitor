import { useCallback, useEffect, useRef, useState } from "react";
import { hotspotApi } from "../lib/api";
import { useViewPresets } from "./useViewPresets";

/**
 * 客户端二次过滤：用于 WS 实时推送的热点（不经后端 API）
 * 与 server/routes/api.js 保持一致：转发/引用放行；原始推文按 source 走阈值
 */
function clientFilter(h, { minViews, minFollowers, minImportance }) {
  if (!h) return false;
  const meta = h.meta || {};
  const imp = h.ai_importance;
  // 重要度阈值（NULL/未评分放行，与 server 端 SQL 行为一致）
  if (minImportance > 0 && imp !== null && imp !== undefined && imp < minImportance) return false;
  if (maxImportance < 1 && imp !== null && imp !== undefined && imp > maxImportance) return false;
  const isRT = meta.isRetweet || meta.isQuote || meta.startsWithRt;
  const isWhitelisted = meta.whitelisted === true;
  if (isRT && !isWhitelisted) return true;
  if (h.source === "twitter") {
    if (minViews > 0 && (meta.views || 0) < minViews) return false;
    if (minFollowers > 0 && (meta.followers || 0) < minFollowers) return false;
  } else if (h.source === "bilibili" && meta.is_up_master) {
    if (minFollowers > 0 && (meta.fans || 0) < minFollowers) return false;
  }
  return true;
}

// 提取 maxImportance 的兼容性解构
function readMaxImportance(thresholds) {
  return thresholds.maxImportance ?? 1;
}

/**
 * 热点状态管理：
 * - 完整筛选/排序/预设/URL 同步
 * - WS 推送应用客户端二次过滤
 * - 暴露 sourceCounts（C3 chip 计数）
 */
export function useHotspots(thresholds = { minViews: 2000, minFollowers: 5000, minImportance: 0.5, maxImportance: 1 }) {
  const { syncToUrl, loadFromUrl } = useViewPresets();

  // 初始状态：从 URL 恢复
  const [filters, setFilters] = useState(() => {
    const urlState = loadFromUrl() || {};
    return {
      source: urlState.source || "",
      sources: urlState.sources || [],
      keyword: urlState.keyword || "",
      keywords: urlState.keywords || [],
      archive: urlState.archive || "active",
      window: urlState.window || "7d",
      minImportance: urlState.minImportance ?? 0.5,
      maxImportance: urlState.maxImportance ?? 1,
      minViews: urlState.minViews ?? 2000,
      minFollowers: urlState.minFollowers ?? 5000,
      sort: urlState.sort || "recent",
      quickTags: urlState.quickTags || [],
    };
  });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceCounts, setSourceCounts] = useState({});

  // 同步到 URL（filters 变更时）
  useEffect(() => {
    syncToUrl(filters);
  }, [filters, syncToUrl]);

  // 拉取列表
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await hotspotApi.list({
        sources: filters.sources,
        source: filters.source || undefined,
        keywords: filters.keywords,
        keyword: filters.keyword || undefined,
        minViews: thresholds.minViews,
        minFollowers: thresholds.minFollowers,
        minImportance: thresholds.minImportance,
        maxImportance: filters.maxImportance,
        sort: filters.sort,
        archive: filters.archive,
        window: filters.window,
        quickTags: filters.quickTags,
      });
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [filters, thresholds.minViews, thresholds.minFollowers, thresholds.minImportance]);

  // 拉取来源计数（C3 chip）
  const refreshCounts = useCallback(async () => {
    try {
      const r = await hotspotApi.countBySource({
        source: filters.source || undefined,
        keywords: filters.keywords,
        keyword: filters.keyword || undefined,
        minFollowers: thresholds.minFollowers,
        minImportance: thresholds.minImportance,
        maxImportance: filters.maxImportance,
        archive: filters.archive,
        window: filters.window,
        quickTags: filters.quickTags,
      });
      setSourceCounts(r.items || {});
    } catch {
      // 静默失败，不影响主列表
    }
  }, [filters, thresholds.minImportance, thresholds.minFollowers]);

  // 应用一组预设（保存 / 加载预设共用）
  const applyFilters = useCallback((next) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const setFilter = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  // 切换来源 chip（多选语义）
  const toggleSource = useCallback((src) => {
    setFilters((prev) => {
      const has = prev.sources.includes(src);
      return { ...prev, sources: has ? prev.sources.filter((s) => s !== src) : [...prev.sources, src] };
    });
  }, []);

  // 切换关键词 chip（多选语义）
  const toggleKeyword = useCallback((kw) => {
    setFilters((prev) => {
      const has = prev.keywords.includes(kw);
      return { ...prev, keywords: has ? prev.keywords.filter((k) => k !== kw) : [...prev.keywords, kw] };
    });
  }, []);

  // 切换一键标签
  const toggleQuickTag = useCallback((tag) => {
    setFilters((prev) => {
      const has = prev.quickTags.includes(tag);
      return { ...prev, quickTags: has ? prev.quickTags.filter((t) => t !== tag) : [...prev.quickTags, tag] };
    });
  }, []);

  // 清空所有筛选（保留 sort + archive）
  const reset = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      sources: [],
      keywords: [],
      minImportance: 0.5,
      maxImportance: 1,
      quickTags: [],
    }));
  }, []);

  // WS prepend（应用客户端二次过滤）
  const prepend = useCallback((hotspot) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === hotspot.id)) return prev;
      const normalized = {
        ...hotspot,
        ai_importance: hotspot.importance ?? hotspot.ai_importance ?? null,
        ai_summary: hotspot.summary ?? hotspot.ai_summary ?? null,
        title_zh: hotspot.title_zh ?? null,
        matched_keywords: hotspot.matched_keywords ?? [],
        displayTitle: (hotspot.title_zh || hotspot.title || "").trim(),
      };
      // 归档视图过滤
      if (filters.archive !== "active" && normalized.archived_at) {
        return prev;
      }
      if (filters.archive === "archived" && !normalized.archived_at) {
        return prev;
      }
      // 来源多选过滤
      if (filters.sources.length > 0 && !filters.sources.includes(normalized.source)) {
        return prev;
      }
      // 关键词多选过滤
      if (filters.keywords.length > 0) {
        const matchedKws = normalized.matched_keywords || [];
        const hit = filters.keywords.some((k) => matchedKws.includes(k));
        if (!hit) return prev;
      }
      // 一键标签过滤
      if (filters.quickTags.length > 0) {
        const meta = normalized.meta || {};
        const isKol = meta.whitelisted === true;
        const isBurst = checkBurst(normalized);
        const matchAny = filters.quickTags.some((tag) =>
          (tag === "kol" && isKol) || (tag === "burst" && isBurst)
        );
        if (!matchAny) return prev;
      }
      // 客户端二次过滤
      if (!clientFilter(normalized, { ...thresholds, maxImportance: filters.maxImportance })) {
        return prev;
      }
      return [normalized, ...prev].slice(0, 200);
    });
  }, [thresholds.minViews, thresholds.minFollowers, thresholds.minImportance, filters.archive, filters.sources, filters.keywords, filters.quickTags, filters.maxImportance]);

  // 触发列表刷新
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 触发计数刷新（filters 变化时）
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  return {
    items,
    loading,
    filters,
    setFilter,
    applyFilters,
    refresh,
    prepend,
    // 工具方法
    toggleSource,
    toggleKeyword,
    toggleQuickTag,
    reset,
    // 计数
    sourceCounts,
    refreshCounts,
  };
}

// 客户端爆款判定（与服务端 quick_tag=burst SQL 一致）
function checkBurst(h) {
  const meta = h.meta || {};
  switch (h.source) {
    case "twitter":
      return (meta.views || 0) >= 100000;
    case "bilibili":
      return (meta.plays || 0) >= 50000;
    case "github":
      return (meta.stars || 0) >= 500;
    case "hackernews":
      return (meta.score || 0) >= 200;
    case "huggingface":
      return (meta.downloads || 0) >= 1000;
    default:
      return false;
  }
}