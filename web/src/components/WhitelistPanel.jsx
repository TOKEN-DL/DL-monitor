import { useState } from "react";
import { Plus, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { whitelistApi } from "../lib/api";
import { cn, timeAgo } from "../lib/utils";

const TYPES = [
  { value: "person", label: "个人", color: "from-indigo-500/30 to-violet-500/20" },
  { value: "company", label: "公司", color: "from-amber-500/30 to-orange-500/20" },
];

export function WhitelistPanel({ items, onChange }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [type, setType] = useState("person");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "");
    if (!h || submitting) return;
    setSubmitting(true);
    try {
      await whitelistApi.add(h, type, note.trim());
      setHandle("");
      setNote("");
      onChange?.();
    } catch (err) {
      alert(err.message || "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(`删除白名单？`)) return;
    try {
      await whitelistApi.remove(id);
      onChange?.();
    } catch (err) {
      alert(err.message || "删除失败");
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 rounded-xl transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          🐦 KOL 白名单
          <span className="font-mono text-[10px] text-amber-400/70">({items.length})</span>
        </span>
        <span className="text-[10px] text-amber-400/60 font-normal">跳过粉丝阈值</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-3">
              {/* 添加表单 */}
              <form onSubmit={submit} className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@handle（如 karpathy）"
                    className="flex-1 rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!handle.trim() || submitting}
                    className="grid place-items-center rounded-md border border-amber-500/40 bg-gradient-to-br from-amber-500/30 to-orange-500/20 px-2 text-amber-200 hover:from-amber-500/50 transition-colors disabled:opacity-40"
                    title="添加"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="备注（可选）"
                  className="w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                        type === t.value
                          ? `border-transparent bg-gradient-to-r ${t.color} text-white`
                          : "border-slate-700/50 text-slate-400 hover:border-slate-500"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </form>

              {/* 列表 */}
              <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1">
                {items.length === 0 ? (
                  <p className="text-center text-[11px] text-slate-500 py-3">暂无白名单</p>
                ) : (
                  items.map((it) => {
                    const tp = TYPES.find((t) => t.value === it.type) || TYPES[0];
                    return (
                      <div
                        key={it.id}
                        className="group flex items-center justify-between rounded-md border border-slate-800/60 bg-slate-900/40 px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "shrink-0 rounded bg-gradient-to-br px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                              tp.color
                            )}
                          >
                            {tp.label}
                          </span>
                          <span className="font-mono text-slate-200">@{it.handle}</span>
                          {it.note && (
                            <span className="text-slate-500 truncate">· {it.note}</span>
                          )}
                        </div>
                        <button
                          onClick={() => remove(it.id)}
                          className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition-colors opacity-0 group-hover:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                白名单作者跳过粉丝/浏览阈值检查，但仍受时间窗限制。删除即生效。
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}