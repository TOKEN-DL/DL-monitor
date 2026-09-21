import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dl-monitor.viewPresets";
const MAX_PRESETS = 20;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

function saveToStorage(presets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
  } catch (e) {
    console.warn("[useViewPresets] save failed:", e.message);
  }
}

/**
 * 预设管理 hook（localStorage 持久化 + URL 同步）
 *
 * 预设数据结构：
 * {
 *   id: 'preset_<ts>_<rand>',
 *   name: '我关注的 KOL',
 *   createdAt: 1234567890,
 *   filters: { sort, sources, keywords, minImportance, maxImportance, window, archive, quickTags, ... }
 *   // 仅保存筛选状态，不保存 data
 * }
 *
 * URL 同步：当前筛选状态可序列化为 ?v=<base64>，方便分享。
 */
export function useViewPresets() {
  const [presets, setPresets] = useState(loadFromStorage);

  useEffect(() => {
    saveToStorage(presets);
  }, [presets]);

  const savePreset = useCallback((name, filters) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    if (presets.length >= MAX_PRESETS) {
      throw new Error(`预设数量已达上限（${MAX_PRESETS}），请先删除部分`);
    }
    const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preset = {
      id,
      name: trimmed.slice(0, 40),
      createdAt: Date.now(),
      filters: sanitize(filters),
    };
    setPresets((prev) => [preset, ...prev]);
    return preset;
  }, []);

  const deletePreset = useCallback((id) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const renamePreset = useCallback((id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: trimmed.slice(0, 40) } : p))
    );
  }, []);

  /**
   * 把当前筛选状态写入 URL（不触发导航）
   * - 简单状态（短字段）直接走 query string
   * - 完整状态走 ?v=<base64 JSON>
   */
  const syncToUrl = useCallback((filters) => {
    const params = new URLSearchParams(window.location.search);
    // 清除 v 与历史状态字段
    params.delete("v");
    delete params.delete; // noop for clarity
    // 只把"非默认"项写入（控制 URL 长度）
    const sparse = compact(filters);
    if (Object.keys(sparse).length === 0) {
      params.delete("v");
    } else {
      try {
        const json = JSON.stringify(sparse);
        // 仅在 URL 不太长时用 base64，否则走 query string
        const b64 = btoa(unescape(encodeURIComponent(json)));
        params.set("v", b64);
      } catch {
        // fallback: 每个字段单独设
        for (const [k, v] of Object.entries(sparse)) {
          if (Array.isArray(v)) params.set(k, v.join(","));
          else params.set(k, String(v));
        }
      }
    }
    const newQs = params.toString();
    const newUrl = window.location.pathname + (newQs ? `?${newQs}` : "") + window.location.hash;
    window.history.replaceState({ ...filters }, "", newUrl);
  }, []);

  /**
   * 从 URL 读取状态
   */
  const loadFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const b64 = params.get("v");
    if (b64) {
      try {
        const json = decodeURIComponent(escape(atob(b64)));
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
    // 也兼容直接走 query string 的形态
    const fromQs = {};
    for (const [k, v] of params.entries()) {
      if (k === "v") continue;
      fromQs[k] = v.includes(",") ? v.split(",") : v;
    }
    return Object.keys(fromQs).length ? fromQs : null;
  }, []);

  return {
    presets,
    savePreset,
    deletePreset,
    renamePreset,
    syncToUrl,
    loadFromUrl,
  };
}

/** 清理 filters 中不需要保存的字段（数据、UI 临时态） */
function sanitize(filters) {
  const out = {};
  const keep = [
    "source", "sources", "keyword", "keywords",
    "minImportance", "maxImportance", "minViews", "minFollowers",
    "sort", "archive", "window", "quickTags",
  ];
  for (const k of keep) {
    if (filters[k] !== undefined) out[k] = filters[k];
  }
  return out;
}

/** 只保留"非默认值"，减小 URL 长度 */
function compact(filters) {
  const DEFAULTS = {
    source: "",
    sources: [],
    keyword: "",
    keywords: [],
    minImportance: 0.5,
    maxImportance: 1,
    minViews: 2000,
    minFollowers: 5000,
    sort: "recent",
    archive: "active",
    window: "7d",
    quickTags: [],
  };
  const out = {};
  for (const [k, v] of Object.entries(filters || {})) {
    if (!(k in DEFAULTS)) continue;
    const def = DEFAULTS[k];
    if (Array.isArray(def) && Array.isArray(v)) {
      if (v.length > 0) out[k] = v;
    } else if (v !== def) {
      out[k] = v;
    }
  }
  return out;
}