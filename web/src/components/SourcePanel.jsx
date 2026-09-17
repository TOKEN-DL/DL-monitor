import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Activity, CheckCircle2, AlertCircle, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, RefreshCw, Rss, Link2, ToggleLeft, ToggleRight,
} from "lucide-react";
import { BackgroundGradient } from "./ui/background-gradient";
import { useSources } from "../hooks/useSources";
import { cn, timeAgo } from "../lib/utils";

function ToggleSwitch({ enabled, onChange, size = "md", title }) {
  const w = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const dot = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      title={title || (enabled ? "点击关闭" : "点击开启")}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer rounded-full border transition-colors",
        w,
        enabled
          ? "border-indigo-500/50 bg-gradient-to-r from-indigo-500 to-violet-500"
          : "border-slate-700 bg-slate-800"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition-transform",
          dot,
          enabled
            ? size === "sm" ? "translate-x-3.5" : "translate-x-4"
            : "translate-x-0.5",
          "mt-[1px]"
        )}
      />
    </button>
  );
}

function HeartbeatItem({ source, status, enabled, onToggle, onRemove, busy }) {
  const isOk = status?.last_status === "ok";
  const lastRun = status?.last_run_at ? timeAgo(status.last_run_at) : "未运行";
  const lastErr = status?.last_error;
  const isUser = source.kind === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-lg border bg-slate-900/40 px-3 py-2 transition-all",
        enabled
          ? "border-slate-800/60 hover:border-slate-700"
          : "border-slate-800/30 opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            !enabled
              ? "bg-slate-600"
              : isOk
                ? "bg-emerald-400 live-dot"
                : "bg-rose-400"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-slate-200">
              {source.label || source.name}
            </span>
            {isUser && (
              <span className="rounded bg-cyan-500/15 px-1 py-px text-[9px] font-mono text-cyan-300 border border-cyan-500/30">
                自定义
              </span>
            )}
          </div>
          {isUser && source.url && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={source.url}>
              {source.url}
            </div>
          )}
        </div>
        <ToggleSwitch
          size="sm"
          enabled={enabled}
          onChange={(v) => onToggle(source.name, v)}
        />
        {isUser && (
          <button
            type="button"
            onClick={() => onRemove(source.name)}
            disabled={busy}
            title="删除此信息源（同时清除其历史热点）"
            className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1 font-mono text-slate-500">
          {!enabled ? (
            <span className="text-slate-500">已关闭</span>
          ) : isOk ? (
            <span className="text-emerald-400">● 运行中</span>
          ) : (
            <span className="text-rose-400">● 异常</span>
          )}
          {lastErr && enabled && (
            <span className="ml-1 truncate max-w-[140px]" title={lastErr}>
              · {lastErr}
            </span>
          )}
        </div>
        <div className="font-mono text-slate-500">{lastRun}</div>
      </div>
    </motion.div>
  );
}

function AddSourceForm({ onAdd, onCancel, busy }) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [testResult, setTestResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setTestResult(null);
    if (!name.trim()) return setErr("请填写源名");
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) return setErr("URL 必须以 http(s):// 开头");
    try {
      const row = await onAdd({ name: name.trim(), label: label.trim() || name.trim(), url: url.trim() });
      setTestResult({ ok: row.test_ok !== false, count: row.test_count, error: row.test_error });
      // 自动重置 form
      setName(""); setLabel(""); setUrl("");
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
        <Plus className="h-3.5 w-3.5" />
        新增信息源
      </div>
      <p className="text-[10px] text-slate-500">
        系统会先尝试 RSS 自动发现，失败降级到 HTML 标题抓取。
      </p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="源 ID（英文/数字，如 abc-news）"
        disabled={busy}
        className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-400 focus:outline-none"
      />
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="显示名（可选，留空用源 ID）"
        disabled={busy}
        className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-400 focus:outline-none"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL（如 https://www.jiqizhixin.com/）"
        disabled={busy}
        className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-400 focus:outline-none"
      />
      {err && <div className="text-[11px] text-rose-400">⚠ {err}</div>}
      {testResult && (
        <div
          className={cn(
            "text-[11px]",
            testResult.ok ? "text-emerald-400" : "text-amber-400"
          )}
        >
          {testResult.ok
            ? `✓ 测试成功，抓取到 ${testResult.count} 条`
            : `⚠ 添加成功但测试抓取失败${testResult.error ? `：${testResult.error}` : ""}`}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1 rounded bg-gradient-to-r from-indigo-500 to-violet-500 px-2 py-1 text-xs font-medium text-white hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          添加
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
        >
          取消
        </button>
      </div>
    </form>
  );
}

export function SourcePanel({ status, pushOn, onEnablePush }) {
  const { items, loading, add, toggle, remove } = useSources();
  const [adding, setAdding] = useState(false);
  const [busyName, setBusyName] = useState(null);

  const handleAdd = async (params) => {
    setBusyName("__add__");
    try {
      const row = await add(params);
      return row;
    } finally {
      setBusyName(null);
    }
  };

  const handleToggle = async (name, enabled) => {
    setBusyName(name);
    try {
      await toggle(name, enabled);
    } catch (e) {
      alert(`切换失败：${e.message}`);
    } finally {
      setBusyName(null);
    }
  };

  const handleRemove = async (name) => {
    if (!confirm(`确定删除「${name}」？\n该源的历史热点也会被清除。`)) return;
    setBusyName(name);
    try {
      await remove(name);
    } catch (e) {
      alert(`删除失败：${e.message}`);
    } finally {
      setBusyName(null);
    }
  };

  // 合并 useStatus 传来的心跳（如果有），按 name 索引
  const sourceStatus = status?.source_status || [];
  const statusMap = Object.fromEntries(sourceStatus.map((s) => [s.source, s]));

  // 把 useSources 的数据合并心跳字段
  const enriched = items.map((s) => ({
    ...s,
    last_run_at: s.last_run_at || statusMap[s.name]?.last_run_at,
    last_status: s.last_status || statusMap[s.name]?.last_status,
    last_error: s.last_error || statusMap[s.name]?.last_error,
    last_count: s.last_count ?? statusMap[s.name]?.last_count,
  }));

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
          <ConfigRow label="OpenRouter" ok={status?.openrouter?.enabled} okText="已启用" offText="未配置" />
          <ConfigRow label="VAPID 推送" ok={status?.vapid_configured} okText="就绪" offText="未生成" />
          <ConfigRow label="SMTP 邮件" ok={status?.smtp_configured} okText="已配置" offText="占位" />
          <div className="flex items-center justify-between text-slate-400 pt-1">
            <span>分类模型</span>
            <span className="font-mono text-[10px] text-slate-300 truncate max-w-[60%]">
              {status?.openrouter?.classify_model?.split("/").pop() || "-"}
            </span>
          </div>
        </div>
      </div>

      {/* 信息源管理 */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-100">
          <span className="flex items-center gap-2">
            <Rss className="h-4 w-4 text-violet-400" />
            信息源管理
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500">
              {enriched.filter((s) => s.enabled).length}/{enriched.length} 启用
            </span>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              title={adding ? "收起添加表单" : "新增信息源"}
              className={cn(
                "rounded p-1 transition-colors",
                adding
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-slate-500 hover:bg-slate-800 hover:text-indigo-300"
              )}
            >
              {adding ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-3 overflow-hidden"
            >
              <AddSourceForm
                onAdd={handleAdd}
                onCancel={() => setAdding(false)}
                busy={busyName === "__add__"}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          {loading && enriched.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              <Loader2 className="inline-block h-4 w-4 animate-spin" />
              <span className="ml-2">加载中…</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {enriched.map((s) => (
                <HeartbeatItem
                  key={s.name}
                  source={s}
                  status={s}
                  enabled={!!s.enabled}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  busy={busyName === s.name}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        <p className="mt-3 text-[10px] text-slate-600 leading-relaxed">
          · 内置源（Twitter/B站等）仅可切换开关，用户源可删除<br />
          · 关闭后停止抓取，列表中也暂时隐藏该源热点<br />
          · 重新启用会立即恢复显示（数据保留在数据库）
        </p>
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
