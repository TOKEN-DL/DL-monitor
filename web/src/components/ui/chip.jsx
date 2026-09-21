import { cn } from "../../lib/utils";
import { Check, X } from "lucide-react";

/**
 * 通用 chip 组件（用于筛选栏多选/单选 chip）
 *
 * Props:
 * - active: 是否选中
 * - onClick: () => void
 * - onRemove: () => void  （多选时可移除）
 * - count: 数字，显示在 chip 右侧括号
 * - icon: React 组件，可选
 * - children: chip 文字内容
 * - tone: 'default' | 'accent' | 'kol' | 'burst' | 'warn'
 * - size: 'sm' | 'md'
 */
export function Chip({
  active = false,
  onClick,
  onRemove,
  count,
  icon: Icon,
  children,
  tone = "default",
  size = "md",
  className,
  title,
}) {
  const sizeCls =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";

  const tones = {
    default: {
      base: "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-500",
      active: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200",
    },
    accent: {
      base: "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-500",
      active: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
    },
    kol: {
      base: "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-500",
      active: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    },
    burst: {
      base: "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-500",
      active: "border-rose-500/40 bg-rose-500/15 text-rose-200",
    },
    warn: {
      base: "border-slate-700/60 bg-slate-900/60 text-slate-300 hover:border-slate-500",
      active: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    },
  };
  const t = tones[tone] || tones.default;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium transition-all",
        sizeCls,
        active ? t.active : t.base,
        onClick && "cursor-pointer",
        className
      )}
    >
      {active && <Check className="h-3 w-3 -ml-0.5" />}
      {Icon && !active && <Icon className="h-3 w-3 -ml-0.5" />}
      <span>{children}</span>
      {count !== undefined && count !== null && (
        <span className={cn("ml-0.5 font-mono", active ? "opacity-90" : "opacity-60")}>
          ({count})
        </span>
      )}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          className="-mr-1 ml-0.5 grid place-items-center rounded-full p-0.5 hover:bg-rose-500/30 hover:text-rose-200"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
        >
          <X className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}