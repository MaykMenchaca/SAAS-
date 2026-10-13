import type { ReactNode } from "react";
import { useCallback, useId, useRef, useState } from "react";

import { cn } from "../../lib/cn";

type TooltipProps = {
  children: ReactNode;
  content: string;
  delay?: number;
  side?: "top" | "bottom" | "left" | "right";
};

export function Tooltip({ children, content, delay = 400, side = "top" }: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    clearTimeout(exitTimer.current);
    enterTimer.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(enterTimer.current);
    exitTimer.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const sideClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      aria-describedby={visible ? id : undefined}
      className="relative inline-flex"
      onBlur={hide}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible ? (
        <span
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-lg",
            "fade-in",
            sideClasses[side],
          )}
          id={id}
          role="tooltip"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
