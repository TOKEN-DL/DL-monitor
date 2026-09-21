import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, X, Radio, History, Check, CheckCheck, Trash2,
  ExternalLink, BellOff, Mail,
} from "lucide-react";
import { cn, timeAgo, getSourceLabel } from "../lib/utils";

const KIND_STYLES = {
  info: {
    border: "border-indigo-500/40",
    bg: "bg-indigo-500/15",
    icon: "bg-indigo-500/30 text-indigo-200",
    unread: "border-indigo-400/60 bg-indigo-500/10",
    unreadBar: "bg-indigo-400",
  },
  warn: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/15",
    icon: "bg-amber-500/30 text-amber-200",
    unread: "border-amber-400/60 bg-amber-500/10",
    unreadBar: "bg-amber-400",
  },
  critical: {
    border: "border-rose-500/50",
    bg: "bg-rose-500/15",
    icon: "bg-rose-500/30 text-rose-200",
    unread: "border-rose-400/60 bg-rose-500/10",
    unreadBar: "bg-rose-400",
  },
};

function ToastIcon({ kind }) {
  return kind === "critical" ? (
    <Flame className="w-4 h-4" />
  ) : (
    <Radio className="w-4 h-4" />
  );
}

function ToastCard({ t, onDismiss, onToggleRead }) {
  const s = KIND_STYLES[t.kind] || KIND_STYLES.info;
  return (
    <motion.div
      key={t.id}
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-xl shadow-glow",
        s.border, s.bg
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", s.icon)}>
          <ToastIcon kind={t.kind} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            {t.title}
            <span className="font-mono text-[10px] text-slate-400">{timeAgo(t.ts)}</span>
          </div>
          <a
            href={t.url}
            target="_blank"
            rel="noopener"
            className="mt-1 block text-xs text-slate-300 hover:text-indigo-300 line-clamp-3"
          >
            {t.msg}
          </a>
        </div>
        <button
          onClick={() => onDismiss(t.id)}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function HistoryItem({ t, onToggleRead, onRemove, onOpen }) {
  const s = KIND_STYLES[t.kind] || KIND_STYLES.info;
  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-slate-900/40 p-2.5 transition-all",
        t.read
          ? "border-slate-800/40 opacity-70 hover:opacity-100"
          : cn(s.border, s.unread, "shadow-sm")
      )}
    >
      {/* 未读色条 */}
      {!t.read && (
        <div className={cn("absolute left-0 top-0 bottom-0 w-0.5 rounded-l", s.unreadBar)} />
      )}

      <div className="flex items-start gap-2 pl-1.5">
        <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", s.icon)}>
          <ToastIcon kind={t.kind} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-semibold text-slate-100">
              {t.source ? getSourceLabel(t.source) : t.title}
              {t.importance != null && (
                <span className="ml-1 font-mono text-[10px] text-slate-400">
                  · {t.importance.toFixed(2)}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-slate-500">
              {timeAgo(t.ts)}
            </span>
          </div>
          <a
            href={t.url}
            target="_blank"
            rel="noopener"
            onClick={onOpen}
            className="mt-0.5 block text-[11px] text-slate-300 hover:text-indigo-300 line-clamp-2 leading-snug"
          >
            {t.msg}
          </a>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleRead(t.id)}
              className={cn(
                "flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                t.read
                  ? "bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                  : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
              )}
              title={t.read ? "点击标为未读" : "点击标为已读"}
            >
              {t.read ? (
                <>
                  <BellOff className="w-2.5 h-2.5" />
                  未读
                </>
              ) : (
                <>
                  <Check className="w-2.5 h-2.5" />
                  已读
                </>
              )}
            </button>
            <a
              href={t.url}
              target="_blank"
              rel="noopener"
              onClick={onOpen}
              className="flex items-center gap-0.5 rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700/60 hover:text-indigo-300"
              title="打开原链接"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              打开
            </a>
            <button
              type="button"
              onClick={() => onRemove(t.id)}
              className="ml-auto rounded p-1 text-slate-500 opacity-0 transition-all hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
              title="删除此条"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Toast 通知中心
 *
 * 双模式：
 * 1. 浮窗模式（默认）：右下角显示当前活跃 toast（最多 5 条，8s 自动消失）
 * 2. 历史抽屉（点 📜 按钮展开）：列出所有历史（最多 200 条）
 *    - 未读高亮 + 色条
 *    - 每条可标已读/未读
 *    - 全部已读 / 清空操作
 */
export function ToastStack({
  toasts,
  onDismiss,
  history = [],
  unreadCount = 0,
  onToggleRead,
  onMarkAllRead,
  onClearHistory,
  onRemoveHistoryItem,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      {/* 历史抽屉（点 📜 后从右侧展开） */}
      <AnimatePresence>
        {historyOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setHistoryOpen(false)}
            />
            {/* 抽屉 */}
            <motion.div
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-4 right-4 z-50 w-[380px] max-h-[min(720px,calc(100vh-2rem))] flex flex-col rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
            >
              {/* 标题栏 */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-800/60 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-slate-100">通知历史</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-rose-300">
                      {unreadCount} 未读
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-slate-500">· {history.length} 条</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  title="关闭"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 操作栏 */}
              {history.length > 0 && (
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-800/40 px-4 py-2">
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    disabled={unreadCount === 0}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-40"
                    title="标记全部为已读"
                  >
                    <CheckCheck className="h-3 w-3" />
                    全部已读
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`清空全部 ${history.length} 条历史？此操作不可撤销。`)) {
                        onClearHistory?.();
                      }
                    }}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                    title="清空全部历史"
                  >
                    <Trash2 className="h-3 w-3" />
                    清空
                  </button>
                  <span className="ml-auto text-[10px] text-slate-500">
                    上限 200 · localStorage
                  </span>
                </div>
              )}

              {/* 列表 */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Mail className="mb-2 h-10 w-10 text-slate-600" />
                    <p className="text-xs text-slate-500">暂无历史</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      新消息推送时（importance ≥ 0.7）会自动记录
                    </p>
                  </div>
                ) : (
                  history.map((t) => (
                    <HistoryItem
                      key={t.id}
                      t={t}
                      onToggleRead={onToggleRead}
                      onRemove={onRemoveHistoryItem}
                      onOpen={() => onToggleRead?.(t.id)}
                    />
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 浮窗容器（右下角） */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {/* 历史按钮（始终可见，无 toast 时也显示） */}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className={cn(
            "pointer-events-auto relative ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md shadow-lg transition-all",
            historyOpen
              ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
              : unreadCount > 0
                ? "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                : "border-slate-700/60 bg-slate-900/80 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80"
          )}
          title={historyOpen ? "关闭通知历史" : `查看通知历史（${unreadCount} 未读）`}
        >
          <History className="h-3.5 w-3.5" />
          <span>历史</span>
          {unreadCount > 0 && !historyOpen && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-mono font-bold text-white shadow">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* 当前 toast 列表 */}
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastCard key={t.id} t={t} onDismiss={onDismiss} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}