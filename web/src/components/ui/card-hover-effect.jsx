import { cn } from "../../lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

/**
 * CardHoverEffect — Aceternity 风格：鼠标悬停时相邻卡片被高亮背景跨卡片流动
 * items: [{ title, description, link, customContent? }]
 */
export function HoverEffect({ items, className }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-3",
        className
      )}
    >
      {items.map((item, idx) => (
        <a
          href={item?.link}
          key={item?.link || idx}
          target="_blank"
          rel="noopener"
          className="relative group block p-2 h-full w-full"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && (
              <motion.span
                className="absolute inset-0 h-full w-full bg-indigo-500/15 block rounded-2xl border border-indigo-400/40"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.15 },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15, delay: 0.1 },
                }}
              />
            )}
          </AnimatePresence>
          <Card>
            {item.customContent || (
              <>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </>
            )}
          </Card>
        </a>
      ))}
    </div>
  );
}

export function Card({ className, children }) {
  return (
    <div
      className={cn(
        "rounded-2xl h-full w-full p-4 overflow-hidden bg-gray-900/70 border border-transparent group-hover:border-indigo-500/30 relative z-20 backdrop-blur-sm transition-colors",
        className
      )}
    >
      <div className="relative z-50">{children}</div>
    </div>
  );
}

export function CardTitle({ className, children }) {
  return (
    <h4
      className={cn(
        "text-slate-100 font-bold tracking-wide",
        className
      )}
    >
      {children}
    </h4>
  );
}

export function CardDescription({ className, children }) {
  return (
    <p
      className={cn(
        "mt-3 text-slate-400 tracking-wide leading-relaxed text-sm",
        className
      )}
    >
      {children}
    </p>
  );
}