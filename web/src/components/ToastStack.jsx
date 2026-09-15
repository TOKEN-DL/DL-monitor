import { motion, AnimatePresence } from "framer-motion";
import { Flame, X, Radio } from "lucide-react";
import { cn, timeAgo } from "../lib/utils";

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto overflow-hidden rounded-xl border backdrop-blur-xl shadow-glow",
              t.kind === "critical"
                ? "border-rose-500/50 bg-rose-500/15"
                : t.kind === "warn"
                  ? "border-amber-500/40 bg-amber-500/15"
                  : "border-indigo-500/40 bg-indigo-500/15"
            )}
          >
            <div className="flex items-start gap-3 p-3">
              <div
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-md",
                  t.kind === "critical"
                    ? "bg-rose-500/30 text-rose-200"
                    : "bg-indigo-500/30 text-indigo-200"
                )}
              >
                {t.kind === "critical" ? (
                  <Flame className="w-4 h-4" />
                ) : (
                  <Radio className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                  {t.title}
                  <span className="font-mono text-[10px] text-slate-400">
                    {timeAgo(t.ts)}
                  </span>
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
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}