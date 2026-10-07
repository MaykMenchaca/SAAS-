import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type ToastProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
};

const tones = {
  neutral: "border-neutral-border bg-neutral-surface text-neutral-text-primary",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
};

export function Toast({ className, tone = "neutral", ...props }: ToastProps) {
  return (
    <div
      className={cn("rounded-lg border px-4 py-3 text-sm font-medium", tones[tone], className)}
      role="status"
      {...props}
    />
  );
}
