import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

// `info` se conserva por compatibilidad y se muestra como `accent` (Industry no tiene un tono "info").
type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "outline";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  dot?: boolean;
  tone?: BadgeTone;
};

// Tinte translúcido + texto del mismo tono: todos los pares miden ≥4.5:1 (tools/contrast_check.py)
const tones: Record<BadgeTone, string> = {
  neutral: "bg-line-soft text-ink-2",
  accent: "bg-acc-tint text-acc-text",
  info: "bg-acc-tint text-acc-text",
  success: "bg-ok-tint text-ok",
  warning: "bg-warn-tint text-warn",
  danger: "bg-bad-tint text-bad",
  outline: "border border-accent text-acc-text",
};

export function Badge({ children, className, dot, tone = "neutral", ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 px-2 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
