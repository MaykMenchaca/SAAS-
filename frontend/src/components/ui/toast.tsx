import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type ToastProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
};

// El tinte es translúcido: se apoya sobre el color de fondo para que el texto no se mezcle con lo que haya detrás
const tint = (token: string) => `[background:linear-gradient(var(--color-${token}),var(--color-${token})),var(--color-bg)]`;

const tones = {
  neutral: "border-divider bg-bg text-text",
  success: `border-ok text-ok ${tint("ok-tint")}`,
  danger: `border-bad text-bad ${tint("bad-tint")}`,
  warning: `border-warn text-warn ${tint("warn-tint")}`,
  info: `border-accent text-acc-text ${tint("acc-tint")}`,
};

export function Toast({ className, tone = "neutral", ...props }: ToastProps) {
  return (
    <div
      className={cn("border px-4 py-3 text-sm font-medium shadow-md", tones[tone], className)}
      role="status"
      {...props}
    />
  );
}
