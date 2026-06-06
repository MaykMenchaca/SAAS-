import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-neutral-bg text-neutral-text-secondary border-neutral-border",
  success: "bg-emerald-50 text-success border-emerald-200",
  warning: "bg-amber-50 text-warning border-amber-200",
  danger: "bg-red-50 text-danger border-red-200",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
