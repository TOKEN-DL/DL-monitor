import { cn } from "../../lib/utils";

/**
 * AuroraBackground — Aceternity 官方组件
 * 极光渐变缓慢流动，营造"实时扫描中"的氛围
 */
export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}) {
  return (
    <main>
      <div
        className={cn(
          "relative flex min-h-screen flex-col items-center justify-center bg-gray-950 text-slate-200 transition-bg",
          className
        )}
        {...props}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            "--aurora":
              "repeating-linear-gradient(100deg,#6366f1_10%,#8b5cf6_15%,#06b6d4_20%,#a78bfa_25%,#22d3ee_30%)",
            "--dark-gradient":
              "repeating-linear-gradient(100deg,#000_0%,#000_7%,transparent_10%,transparent_12%,#000_16%)",
            "--white-gradient":
              "repeating-linear-gradient(100deg,#fff_0%,#fff_7%,transparent_10%,transparent_12%,#fff_16%)",
            "--blue-300": "#93c5fd",
            "--blue-400": "#60a5fa",
            "--blue-500": "#6366f1",
            "--indigo-300": "#a5b4fc",
            "--violet-200": "#ddd6fe",
            "--black": "#000",
            "--white": "#fff",
            "--transparent": "transparent",
          }}
        >
          <div
            className={cn(
              `after:animate-aurora pointer-events-none absolute -inset-[10px] [background-image:var(--white-gradient),var(--aurora)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] opacity-40 blur-[10px] invert filter will-change-transform`,
              "[--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_15%,var(--blue-300)_20%,var(--violet-200)_25%,var(--blue-400)_30%)]",
              "[--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]",
              "[--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]",
              "after:[background-image:var(--dark-gradient),var(--aurora)] after:[background-size:200%,_100%]",
              "after:content-['']"
            )}
          />
        </div>
        {showRadialGradient && (
          <div className="absolute inset-0 bg-gray-950 [mask-image:radial-gradient(circle_at_center,white,transparent_70%)] pointer-events-none" />
        )}
        <div className="relative z-10 w-full">{children}</div>
      </div>
    </main>
  );
}