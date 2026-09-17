import { useCallback, useEffect, useState } from "react";
import { hotspotApi } from "../lib/api";

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
  const isRT = meta.isRetweet || meta.isQuote || meta.startsWithRt;
  const isWhitelisted = meta.whitelisted === true;
  // 转发 / 引用 / 引用回复：放行（这些 meta 字段缺失就是原始推文）
  if (isRT && !isWhitelisted) return true;
  if (h.source === "twitter") {
    if (minViews > 0 && (meta.views || 0) < minViews) return false;
    if (minFollowers > 0 && (meta.followers || 0) < minFollowers) return false;
  } else if (h.source === "bilibili" && meta.is_up_master) {
    if (minFollowers > 0 && (meta.fans || 0) < minFollowers) return false;
  }
  return true;
}

/**
 * 热点状态管理：
 * - 支持初始加载 + 过滤刷新
 * - 通过 prepend 实时插入新热点（来自 WebSocket，附客户端二次过滤）
 */
export function useHotspots(thresholds = { minViews: 2000, minFollowers: 5000, minImportance: 0.5 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ source: "", keyword: "", archive: "active" });

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await hotspotApi.list({
        ...filters,
        minViews: thresholds.minViews,
        minFollowers: thresholds.minFollowers,
        minImportance: thresholds.minImportance,
      });
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [filters, thresholds.minViews, thresholds.minFollowers, thresholds.minImportance]);

  const setFilter = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const prepend = useCallback((hotspot) => {
    setItems((prev) => {
      // 去重（id）
      if (prev.some((x) => x.id === hotspot.id)) return prev;
      // 标准化字段
      const normalized = {
        ...hotspot,
        ai_importance: hotspot.importance ?? hotspot.ai_importance ?? null,
        ai_summary: hotspot.summary ?? hotspot.ai_summary ?? null,
        title_zh: hotspot.title_zh ?? null,
        matched_keywords: hotspot.matched_keywords ?? [],
        // displayTitle 优先用中文翻译
        displayTitle: (hotspot.title_zh || hotspot.title || '').trim(),
      };
      // 当前查看的是归档视图时，跳过 WS 推送（实时热点不应出现在归档列表）
      if (filters.archive !== 'active' && normalized.archived_at) {
        return prev;
      }
      if (filters.archive === 'archived' && !normalized.archived_at) {
        return prev;
      }
      // 客户端二次过滤：保证 WS 推送的低浏览量/低重要度条目不会显示在前端
      if (!clientFilter(normalized, thresholds)) {
        console.log(
          `[ws:filtered] #${normalized.id} imp=${normalized.ai_importance} views=${normalized.meta?.views} fans=${normalized.meta?.followers || normalized.meta?.fans}`
        );
        return prev;
      }
      return [normalized, ...prev].slice(0, 200);
    });
  }, [thresholds.minViews, thresholds.minFollowers, thresholds.minImportance, filters.archive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, filters, setFilter, refresh, prepend };
}