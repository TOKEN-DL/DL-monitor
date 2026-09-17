import { useCallback, useEffect, useState } from "react";
import { whitelistApi } from "../lib/api";

export function useWhitelist() {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const next = await whitelistApi.list();
      setItems(next);
    } catch (e) {
      console.warn("[useWhitelist] load failed:", e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, refresh };
}