import { useCallback, useEffect, useState } from "react";
import { keywordApi } from "../lib/api";

export function useKeywords() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const items = await keywordApi.list();
      setKeywords(items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async (text, category) => {
    await keywordApi.add(text, category);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id) => {
    await keywordApi.remove(id);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { keywords, loading, error, add, remove, refresh };
}