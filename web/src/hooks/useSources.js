import { useCallback, useEffect, useState } from "react";
import { sourceApi } from "../lib/api";

/**
 * 信息源管理 hook
 * - 列表：内置 + 用户
 * - toggle：切换 enabled
 * - rename：改 label（仅用户源可改）
 * - remove：删除（仅用户源）
 * - add：新增（name + label + url）
 */
export function useSources() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await sourceApi.list();
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async ({ name, label, url, enabled = true }) => {
    const row = await sourceApi.add({ name, label, url, enabled });
    await refresh();
    return row;
  }, [refresh]);

  const toggle = useCallback(async (name, enabled) => {
    const row = await sourceApi.toggle(name, enabled);
    await refresh();
    return row;
  }, [refresh]);

  const rename = useCallback(async (name, label) => {
    const row = await sourceApi.rename(name, label);
    await refresh();
    return row;
  }, [refresh]);

  const remove = useCallback(async (name) => {
    await sourceApi.remove(name);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh, add, toggle, rename, remove };
}
