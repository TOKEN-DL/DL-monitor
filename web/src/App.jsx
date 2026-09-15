import { useCallback, useEffect, useMemo, useState } from "react";
import { AuroraBackground } from "./components/ui/aurora-background";
import { Header } from "./components/Header";
import { KeywordPanel } from "./components/KeywordPanel";
import { HotspotStream } from "./components/HotspotStream";
import { SourcePanel } from "./components/SourcePanel";
import { ToastStack } from "./components/ToastStack";
import { useKeywords } from "./hooks/useKeywords";
import { useHotspots } from "./hooks/useHotspots";
import { useStatus } from "./hooks/useStatus";
import { useWebSocket } from "./lib/ws";
import { pushApi, runApi } from "./lib/api";
import { urlBase64ToUint8Array } from "./lib/utils";

export default function App() {
  const { keywords, add, remove } = useKeywords();
  const { items, loading, filters, setFilter, refresh, prepend } = useHotspots();
  const { status, wsLive } = useStatus();

  const [pushOn, setPushOn] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [newIds, setNewIds] = useState(new Set());

  // 检测 Web Push 订阅状态
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setPushOn(true);
      } catch {}
    })();
  }, []);

  // WebSocket 实时推送
  useWebSocket(
    useCallback(
      (msg) => {
        if (msg.type === "hotspot") {
          prepend(msg.data);
          setNewIds((prev) => new Set(prev).add(msg.data.id));
          // 弹 toast（仅 imp >= 0.7）
          const imp = msg.data.importance ?? msg.data.ai_importance ?? 0;
          if (imp >= 0.7) {
            const id = Date.now() + Math.random();
            setToasts((prev) => [
              ...prev,
              {
                id,
                title: `${(msg.data.source || "").toUpperCase()} · ${imp.toFixed(2)}`,
                msg: msg.data.title || msg.data.summary || "(无标题)",
                url: msg.data.url,
                ts: Date.now(),
                kind: imp >= 0.85 ? "critical" : "info",
              },
            ].slice(-5));
            // 8s 自动消失
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 8000);
          }
        }
      },
      [prepend]
    )
  );

  // 触发抓取
  const triggerRun = useCallback(async () => {
    if (triggering) return;
    setTriggering(true);
    try {
      await runApi.trigger();
      // 4 秒后刷新列表（给 AI 分析时间）
      setTimeout(refresh, 4500);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setTriggering(false), 5000);
    }
  }, [triggering, refresh]);

  // 启用推送
  const enablePush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("当前浏览器不支持推送");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const { publicKey, configured } = await pushApi.vapid();
      if (!configured) {
        alert("VAPID 未配置，请重启服务自动生成");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("通知权限被拒绝");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await pushApi.subscribe(sub);
      setPushOn(true);
    } catch (e) {
      console.error(e);
      alert("启用失败：" + e.message);
    }
  }, []);

  const aiOn = !!status?.openrouter?.enabled;

  return (
    <AuroraBackground className="overflow-x-hidden">
      <div className="min-h-screen">
        <Header wsLive={wsLive} pushOn={pushOn} aiOn={aiOn} />

        <main className="mx-auto max-w-[1600px] px-3 py-5 md:px-6 md:py-6">
          <div className="grid gap-5 lg:gap-6 lg:grid-cols-[300px_1fr_320px]">
            {/* 左：关键词 */}
            <aside className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4 backdrop-blur-md">
              <SectionTitle title="监控关键词" subtitle="// WATCHLIST" />
              <KeywordPanel
                keywords={keywords}
                onAdd={add}
                onRemove={remove}
                filterKeyword={filters.keyword}
                onFilterChange={(v) => setFilter({ keyword: v })}
              />
            </aside>

            {/* 中：热点流 */}
            <section>
              <HotspotStream
                items={items}
                loading={loading}
                filters={filters}
                setFilter={setFilter}
                onTriggerRun={triggerRun}
                triggering={triggering}
                newIds={newIds}
              />
            </section>

            {/* 右：通知 + 配置 + 心跳 */}
            <aside>
              <SectionTitle title="通知 & 配置" subtitle="// CONTROL" />
              <SourcePanel
                status={status}
                pushOn={pushOn}
                onEnablePush={enablePush}
              />
            </aside>
          </div>
        </main>
      </div>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </AuroraBackground>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-100">
        {title}
      </h2>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {subtitle}
      </span>
    </div>
  );
}