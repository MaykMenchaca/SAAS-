import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type ToastProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "danger";
};

const tones = {
  neutral: "border-neutral-border bg-neutral-surface text-neutral-text-primary",
  success: "border-emerald-200 bg-emerald-50 text-success",
  danger: "border-red-200 bg-red-50 text-danger",
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
