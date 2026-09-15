import { useCallback, useEffect, useState } from "react";
import { statusApi } from "../lib/api";

export function useStatus() {
  const [status, setStatus] = useState(null);
  const [wsLive, setWsLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await statusApi.get();
      setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const onStatus = (e) => setWsLive(e.detail === "live");
    window.addEventListener("ws-status", onStatus);
    return () => window.removeEventListener("ws-status", onStatus);
  }, []);

  return { status, wsLive, refresh };
}