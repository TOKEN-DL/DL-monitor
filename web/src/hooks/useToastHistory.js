import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dl-monitor.toastHistory";
const MAX_ITEMS = 200;

/**
 * Toast 历史管理 hook（localStorage 持久化）
 *
 * 数据结构：
 * {
 *   id: number,
 *   title: string,
 *   msg: string,
 *   url: string,
 *   ts: number,
 *   kind:  "info" | "warn" | "critical",
 *   source?: string,
 *   importance?: number,
 *   read: boolean
 * }
 *
 * 上限 MAX_ITEMS（200），FIFO 淘汰最旧
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function saveToStorage(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch (e) {
    console.warn("[useToastHistory] save failed:", e.message);
  }
}

export function useToastHistory() {
  const [history, setHistory] = useState(loadFromStorage);

  useEffect(() => {
    saveToStorage(history);
  }, [history]);

  /**
   * 添加一条 toast（保留最近 200 条，FIFO 淘汰）
   */
  const addToast = useCallback((toast) => {
    const item = {
      id: toast.id ?? Date.now() + Math.random(),
      title: toast.title,
      msg: toast.msg,
      url: toast.url,
      ts: toast.ts ?? Date.now(),
      kind: toast.kind || "info",
      source: toast.source || null,
      importance: toast.importance ?? null,
      read: false,
    };
    setHistory((prev) => [item, ...prev].slice(0, MAX_ITEMS));
  }, []);

  /**
   * 标记已读
   */
  const markRead = useCallback((id) => {
    setHistory((prev) => prev.map((t) => (t.id === id ? { ...t, read: true } : t)));
  }, []);

  /**
   * 标记未读
   */
  const markUnread = useCallback((id) => {
    setHistory((prev) => prev.map((t) => (t.id === id ? { ...t, read: false } : t)));
  }, []);

  /**
   * 全部标记已读
   */
  const markAllRead = useCallback(() => {
    setHistory((prev) => prev.map((t) => (t.read ? t : { ...t, read: true })));
  }, []);

  /**
   * 清空历史
   */
  const clear = useCallback(() => {
    setHistory([]);
  }, []);

  /**
   * 删除单条
   */
  const remove = useCallback((id) => {
    setHistory((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = history.filter((t) => !t.read).length;

  return {
    history,
    unreadCount,
    addToast,
    markRead,
    markUnread,
    markAllRead,
    clear,
    remove,
  };
}