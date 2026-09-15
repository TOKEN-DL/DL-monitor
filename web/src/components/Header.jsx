import { motion } from "framer-motion";
import { Radio, Bell, Cpu } from "lucide-react";
import { cn } from "../lib/utils";

function StatusBadge({ label, icon: Icon, on, hint }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md border transition-colors",
        on
          ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
          : "border-slate-700/60 bg-slate-800/40 text-slate-400"
      )}
      title={hint}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="font-mono tracking-wide">{label}</span>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          on ? "bg-emerald-400 live-dot" : "bg-slate-500"
        )}
      />
    </div>
  );
}

export function Header({ wsLive, pushOn, aiOn }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-40 w-full border-b border-slate-800/60 bg-gray-950/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 md:px-6">
        {/* 品牌 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-full bg-indigo-500/30 blur-md"
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
            <div className="relative grid h-10 w-10 place-items-center rounded-full border border-indigo-400/50 bg-gradient-to-br from-indigo-600 to-violet-700 shadow-glow">
              <Radio className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white md:text-lg">
              DL-monitor
              <span className="ml-2 text-[10px] font-normal text-indigo-300/80 uppercase tracking-[0.2em]">
                AI Radar
              </span>
            </h1>
            <p className="hidden text-xs text-slate-400 md:block">
              走在吃瓜第一线 · 5 源实时扫描 · OpenRouter AI 解读
            </p>
          </div>
        </div>

        {/* 状态徽标 */}
        <div className="flex items-center gap-2 md:gap-3">
          <StatusBadge
            label={wsLive ? "WS:LIVE" : "WS:OFF"}
            icon={Radio}
            on={wsLive}
            hint="WebSocket 实时连接状态"
          />
          <StatusBadge
            label={pushOn ? "PUSH:ON" : "PUSH:--"}
            icon={Bell}
            on={pushOn}
            hint="浏览器推送订阅"
          />
          <StatusBadge
            label={aiOn ? "AI:ON" : "AI:--"}
            icon={Cpu}
            on={aiOn}
            hint="OpenRouter AI 引擎"
          />
        </div>
      </div>
    </motion.header>
  );
}