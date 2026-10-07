import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white border-primary hover:bg-primary-hover",
  secondary: "bg-neutral-surface text-neutral-text-primary border-neutral-border hover:bg-neutral-bg",
  danger: "bg-danger text-white border-danger hover:brightness-95",
  ghost: "bg-transparent text-neutral-text-secondary border-transparent hover:bg-neutral-bg",
  icon: "bg-neutral-surface text-neutral-text-secondary border-neutral-border hover:bg-neutral-bg hover:text-neutral-text-primary",
};

export function Button({
  children,
  className,
  disabled,
  icon,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-[transform,colors] duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary/50",
        variants[variant],
        disabled && "cursor-not-allowed opacity-55",
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
