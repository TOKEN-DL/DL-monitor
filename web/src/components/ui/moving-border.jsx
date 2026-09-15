import { cn } from "../../lib/utils";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useRef } from "react";

/**
 * MovingBorder — 边缘光持续流动
 * 用于关键词标签 / 重点强调框
 */
export function MovingBorder({
  children,
  duration = 3000,
  rx,
  ry,
  className,
  borderClassName,
  ...otherProps
}) {
  const pathRef = useRef(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength?.();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(progress, (val) =>
    pathRef.current?.getPointAtLength(val)?.x
  );
  const y = useTransform(progress, (val) =>
    pathRef.current?.getPointAtLength(val)?.y
  );
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        {...otherProps}
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx}
          ry={ry}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "inline-block",
          transform,
        }}
      >
        {children}
      </motion.div>
    </>
  );
}

/**
 * 高阶：带 moving-border 容器的 wrapper
 */
export function BorderWrapper({
  children,
  className,
  containerClassName,
  borderClassName,
  duration = 4000,
  as: Component = "div",
  ...otherProps
}) {
  return (
    <Component
      className={cn(
        "relative overflow-hidden bg-transparent p-[1.5px]",
        containerClassName
      )}
      {...otherProps}
    >
      <div className="absolute inset-0" style={{ borderRadius: "calc(0.75rem * 0.96)" }}>
        <MovingBorder duration={duration} rx="30%" ry="30%">
          <div
            className={cn(
              "h-24 w-24 bg-[radial-gradient(#6366f1_40%,transparent_60%)] opacity-90",
              borderClassName
            )}
          />
        </MovingBorder>
      </div>
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center border border-slate-800 bg-slate-900/[0.85] text-sm text-slate-100 antialiased backdrop-blur-xl",
          className
        )}
        style={{ borderRadius: "calc(0.75rem * 0.96)" }}
      >
        {children}
      </div>
    </Component>
  );
}