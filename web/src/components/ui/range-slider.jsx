import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

/**
 * 双滑块数值选择器（用于 F4 重要度区间）
 *
 * Props:
 * - min, max: 范围（默认 0, 1）
 * - step: 步长（默认 0.05）
 * - value: [low, high]
 * - onChange: (newValue) => void
 * - label: 标题
 * - format: (v) => string  格式化显示
 */
export function RangeSlider({
  min = 0,
  max = 1,
  step = 0.05,
  value = [min, max],
  onChange,
  label,
  format = (v) => v.toFixed(2),
  className,
}) {
  const [low, high] = value;
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'low' | 'high' | null
  const lastValueRef = useRef(value);

  // 触发 onChange 包装（避免无意义 render）
  const commit = useCallback((next) => {
    const a = clamp(next[0], min, next[1]);
    const b = clamp(next[1], a, max);
    const final = [a, b];
    if (
      final[0] !== lastValueRef.current[0] ||
      final[1] !== lastValueRef.current[1]
    ) {
      lastValueRef.current = final;
      onChange?.(final);
    }
  }, [min, max, onChange]);

  // 处理拖拽
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const v = min + ratio * (max - min);
      const snapped = Math.round(v / step) * step;
      if (dragging === "low") commit([snapped, lastValueRef.current[1]]);
      else commit([lastValueRef.current[0], snapped]);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, min, max, step, commit]);

  const lowPct = ((low - min) / (max - min)) * 100;
  const highPct = ((high - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-1.5 min-w-[160px]", className)}>
      {label && (
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{label}</span>
          <span className="font-mono text-slate-300">
            {format(low)} – {format(high)}
          </span>
        </div>
      )}
      <div
        ref={trackRef}
        className="relative h-5 cursor-pointer"
        onMouseDown={(e) => {
          const track = trackRef.current;
          if (!track) return;
          const rect = track.getBoundingClientRect();
          const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
          const v = min + ratio * (max - min);
          const snapped = Math.round(v / step) * step;
          // 哪边更近选哪边
          const distLow = Math.abs(snapped - low);
          const distHigh = Math.abs(snapped - high);
          const which = distLow < distHigh ? "low" : "high";
          setDragging(which);
          if (which === "low") commit([snapped, high]);
          else commit([low, snapped]);
          e.preventDefault();
        }}
      >
        {/* 轨道 */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full bg-slate-800" />
        {/* 选中段 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        {/* low handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white border-2 border-indigo-500 cursor-grab active:cursor-grabbing shadow"
          style={{ left: `${lowPct}%` }}
          onMouseDown={(e) => {
            setDragging("low");
            e.stopPropagation();
            e.preventDefault();
          }}
        />
        {/* high handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white border-2 border-violet-500 cursor-grab active:cursor-grabbing shadow"
          style={{ left: `${highPct}%` }}
          onMouseDown={(e) => {
            setDragging("high");
            e.stopPropagation();
            e.preventDefault();
          }}
        />
      </div>
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}