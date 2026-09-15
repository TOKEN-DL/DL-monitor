import { motion } from "framer-motion";
import { Bell, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { BackgroundGradient } from "./ui/background-gradient";
import { cn, SOURCE_LABELS, timeAgo } from "../lib/utils";

function HeartbeatItem({ source, status, enabled }) {
  const isOk = status?.last_status === "ok";
  const lastRun = status?.last_run_at ? timeAgo(status.last_run_at) : "未运行";
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            !enabled
              ? "bg-slate-600"
              : isOk
                ? "bg-emerald-400 live-dot"
                : "bg-rose-400"
          )}
        />
        <span className="font-medium text-slate-200">{SOURCE_LABELS[source] || source}</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-slate-400">
          {!enabled ? "已关闭" : isOk ? "OK" : "异常"}
        </div>
        <div className="text-[10px] text-slate-500">{lastRun}</div>
      </div>
    </div>
  );
}

export function SourcePanel({ status, pushOn, onEnablePush }) {
  const sources = status?.sources || {};
  const sourceStatus = status?.source_status || [];
  const statusMap = Object.fromEntries(sourceStatus.map((s) => [s.source, s]));

  return (
    <div className="space-y-5">
      {/* 推送 */}
      <BackgroundGradient containerClassName="rounded-2xl" className="p-4 border-slate-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Bell className="w-4 h-4 text-indigo-400" />
            浏览器推送
          </div>
          <p className="text-xs text-slate-400">
            {pushOn
              ? "已启用 · 重要热点将触发系统通知"
              : "点击下方按钮申请通知权限"}
          </p>
          <button
            onClick={onEnablePush}
            disabled={pushOn}
            className={cn(
              "mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium transition-all",
              pushOn
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default"
                : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-400 hover:to-violet-400 shadow-glow"
            )}
          >
            {pushOn ? "✓ 已订阅" : "启用推送通知"}
          </button>
        </div>
      </BackgroundGradient>

      {/* 配置状态 */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          配置状态
        </div>
        <div className="space-y-2 text-xs">
          <ConfigRow
            label="OpenRouter"
            ok={status?.openrouter?.enabled}
            okText="已启用"
            offText="未配置"
          />
          <ConfigRow
            label="VAPID 推送"
            ok={status?.vapid_configured}
            okText="就绪"
            offText="未生成"
          />
          <ConfigRow
            label="SMTP 邮件"
            ok={status?.smtp_configured}
            okText="已配置"
            offText="占位"
          />
          <div className="flex items-center justify-between text-slate-400 pt-1">
            <span>分类模型</span>
            <span className="font-mono text-[10px] text-slate-300 truncate max-w-[60%]">
              {status?.openrouter?.classify_model?.split("/").pop() || "-"}
            </span>
          </div>
        </div>
      </div>

      {/* 数据源心跳 */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-100 mb-3">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />
            数据源心跳
          </span>
          <span className="font-mono text-[10px] text-slate-500">{Object.keys(sources).length} 个</span>
        </div>
        <div className="space-y-2">
          {Object.entries(sources).map(([name, enabled]) => (
            <HeartbeatItem
              key={name}
              source={name}
              status={statusMap[name]}
              enabled={enabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, ok, okText, offText }) {
  return (
    <div className="flex items-center justify-between text-slate-300">
      <span>{label}</span>
      <span
        className={cn(
          "flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium",
          ok
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-slate-700/50 text-slate-400"
        )}
      >
        {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {ok ? okText : offText}
      </span>
    </div>
  );
}