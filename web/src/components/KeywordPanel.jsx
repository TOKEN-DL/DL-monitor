import { useState } from "react";
import { Plus, X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BorderWrapper } from "./ui/moving-border";
import { WhitelistPanel } from "./WhitelistPanel";

const CATEGORIES = [
  { value: "general", label: "通用", color: "from-slate-500/30 to-slate-600/20" },
  { value: "model", label: "大模型", color: "from-indigo-500/30 to-violet-500/20" },
  { value: "tool", label: "工具", color: "from-cyan-500/30 to-sky-500/20" },
  { value: "paper", label: "论文", color: "from-emerald-500/30 to-teal-500/20" },
  { value: "news", label: "新闻", color: "from-rose-500/30 to-pink-500/20" },
];

const SEED_WHITELIST = [
  { handle: "karpathy", type: "person", note: "AI 教育" },
  { handle: "sama", type: "person", note: "OpenAI CEO" },
  { handle: "ylecun", type: "person", note: "Meta AI 首席" },
  { handle: "AnthropicAI", type: "company", note: "Claude 团队" },
  { handle: "OpenAI", type: "company", note: "GPT 团队" },
  { handle: "GoogleDeepMind", type: "company", note: "Gemini 团队" },
  { handle: "huggingface", type: "company", note: "HF 平台" },
  { handle: "MistralAI", type: "company", note: "Mistral 团队" },
  { handle: "deepseek_ai", type: "company", note: "DeepSeek" },
  { handle: "karminski3", type: "person", note: "AI 资讯搬运" },
];

export function KeywordPanel({ keywords, onAdd, onRemove, filterKeyword, onFilterChange, whitelistItems, onWhitelistChange }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("model");

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await onAdd(text.trim(), category);
    setText("");
  };

  return (
    <div className="space-y-5">
      {/* 输入区 */}
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入关键词或 @博主（如 Claude、@karpathy）"
            className="flex-1 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            className="grid place-items-center rounded-lg border border-indigo-500/40 bg-gradient-to-br from-indigo-500/30 to-violet-500/20 px-3 text-indigo-200 hover:from-indigo-500/50 transition-colors"
            title="添加"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all " +
                (category === c.value
                  ? `border-transparent bg-gradient-to-r ${c.color} text-white shadow-glow`
                  : "border-slate-700/50 text-slate-400 hover:border-slate-500")
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          提示：以 <span className="text-pink-300 font-mono">@</span> 开头的关键词会被识别为 B站 UP主查询（如 <span className="font-mono">@karpathy</span>）。
        </p>
      </form>

      {/* 关键词列表（MovingBorder） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>已启用 ({keywords.length})</span>
          <span className="font-mono text-[10px] text-slate-500">// LIVE</span>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          <AnimatePresence mode="popLayout">
            {keywords.length === 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-xs text-slate-500 py-8"
              >
                尚未配置关键词
              </motion.p>
            )}
            {keywords.map((kw) => {
              const cat = CATEGORIES.find((c) => c.value === kw.category) || CATEGORIES[0];
              const isAccount = kw.text.startsWith('@');
              return (
                <motion.div
                  key={kw.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <BorderWrapper
                    duration={5000 + kw.id * 137}
                    containerClassName="w-full"
                    className="px-3 py-2 flex items-center justify-between"
                    borderClassName={isAccount
                      ? "h-16 w-16 bg-[radial-gradient(#ec4899_40%,transparent_70%)]"
                      : "h-16 w-16 bg-[radial-gradient(#8b5cf6_30%,transparent_60%)]"}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={
                          "shrink-0 rounded-md bg-gradient-to-br px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider " +
                          cat.color
                        }
                      >
                        {cat.label}
                      </span>
                      {isAccount && (
                        <span className="shrink-0 rounded-md bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-pink-300 border border-pink-500/30">
                          博主
                        </span>
                      )}
                      <span className="truncate text-sm font-medium text-slate-100">
                        {kw.text}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`删除关键词「${kw.text}」？`)) onRemove(kw.id);
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                      title="删除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </BorderWrapper>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* 过滤框 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={filterKeyword}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="按关键词过滤热点…"
          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 pl-8 pr-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        />
      </div>

      {/* KOL 白名单 */}
      <WhitelistPanel
        items={whitelistItems}
        onChange={onWhitelistChange}
        seedList={SEED_WHITELIST}
      />
    </div>
  );
}