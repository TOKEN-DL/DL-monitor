import { cn } from "../../lib/utils";
import { motion, stagger, useAnimate } from "framer-motion";
import { useEffect } from "react";

/**
 * TextGenerateEffect — 文字一个字一个字蹦出，制造"情报解码"紧迫感
 */
export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.4,
  wordClassName,
}) {
  const [scope, animate] = useAnimate();
  const wordsArray = String(words || "").split(" ");

  useEffect(() => {
    if (!scope.current) return;
    animate(
      "span",
      {
        opacity: 1,
        filter: filter ? "blur(0px)" : "none",
      },
      {
        duration: duration || 1,
        delay: stagger(0.06),
      }
    );
  }, [scope.current, words]);

  const renderWords = () => {
    return (
      <motion.div ref={scope} className="inline">
        {wordsArray.map((word, idx) => (
          <motion.span
            key={word + idx}
            className={cn(
              "opacity-0 inline-block",
              wordClassName
            )}
            style={{
              filter: filter ? "blur(8px)" : "none",
            }}
          >
            {word}
            {idx < wordsArray.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </motion.div>
    );
  };

  return (
    <div className={cn("inline-block", className)}>
      <div className={cn("leading-relaxed", wordClassName)}>
        {renderWords()}
      </div>
    </div>
  );
}