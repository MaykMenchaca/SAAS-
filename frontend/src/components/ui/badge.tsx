import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  dot?: boolean;
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-neutral-bg text-neutral-text-secondary border-neutral-border",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-info/10 text-info border-info/30",
};

export function Badge({ children, className, dot, tone = "neutral", ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold",
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
