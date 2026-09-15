import { cn } from "../../lib/utils";

/**
 * BackgroundGradient — Aceternity UI 风格的多色径向渐变容器
 * 用法：
 *   <BackgroundGradient className="rounded-2xl">
 *     <div className="bg-gray-950 rounded-2xl p-6">内容</div>
 *   </BackgroundGradient>
 */
export function BackgroundGradient({ children, className, innerClassName }) {
  return (
    <div className={cn("relative rounded-[inherit] p-[1.5px]", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-[inherit] will-change-transform",
          "bg-[radial-gradient(circle_farthest-side_at_0_100%,#06b6d4,transparent),radial-gradient(circle_farthest-side_at_100%_0,#8b5cf6,transparent),radial-gradient(circle_farthest-side_at_100%_100%,#f43f5e,transparent),radial-gradient(circle_farthest-side_at_0_0,#6366f1,#030712)]"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-[inherit] bg-gray-950",
          innerClassName
        )}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * 仅按钮 / 圆角小元素用的渐变边框变体
 */
export function GradientBorder({ children, className }) {
  return (
    <div
      className={cn(
        "relative rounded-xl p-[1.5px] overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 opacity-80" />
      <div className="relative bg-gray-950 rounded-[calc(0.75rem-1.5px)]">
        {children}
      </div>
    </div>
  );
}