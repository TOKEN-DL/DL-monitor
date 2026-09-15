import { useCallback, useEffect, useRef, useState } from "react";
import { hotspotApi } from "../lib/api";

/**
 * 热点状态管理：
 * - 支持初始加载 + 过滤刷新
 * - 通过 prependHotspot 实时插入新热点（来自 WebSocket）
 */
export function useHotspots() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ source: "", keyword: "" });

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await hotspotApi.list(filters);
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [filters]);

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
        ai_importance: hotspot.importance ?? hotspot.ai_importance ?? 0.5,
        ai_summary: hotspot.summary ?? hotspot.ai_summary ?? null,
        matched_keywords: hotspot.matched_keywords ?? [],
      };
      return [normalized, ...prev].slice(0, 200);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, filters, setFilter, refresh, prepend };
}