import { useEffect, useRef } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const handlerRef = useRef(onMessage);

  // 始终调用最新回调
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let closed = false;
    let retry = null;

    function connect() {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        window.dispatchEvent(new CustomEvent('ws-status', { detail: 'live' }));
      };
      ws.onclose = () => {
        window.dispatchEvent(new CustomEvent('ws-status', { detail: 'down' }));
        retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handlerRef.current?.(msg);
        } catch {}
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try { wsRef.current?.close(); } catch {}
    };
  }, []);
}