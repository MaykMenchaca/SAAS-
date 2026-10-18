import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Corners } from "./corners";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon";
type ButtonSize = "sm" | "md" | "lg";

// ComponentProps incluye `ref` (React 19: es una prop más y llega al <button> por el spread)
type ButtonProps = ComponentProps<"button"> & {
  /** Marcas de registro "+" en las esquinas: solo para la acción principal de una pantalla. */
  frame?: boolean;
  icon?: ReactNode;
  /** `md` (44 px) es el tamaño táctil por defecto; `sm` baja a 36 px en escritorio; `lg` es para el POS. */
  size?: ButtonSize;
  variant?: ButtonVariant;
};

// Estados hover/active salen de la rampa del acento (Industry). En oscuro el acento es claro,
// así que "presionado" va hacia el extremo claro de la rampa.
const variants: Record<ButtonVariant, string> = {
  primary:
    "border-accent bg-accent text-on-acc hover:bg-accent-hover active:bg-accent-900 dark:active:bg-accent-200",
  secondary: "border-divider bg-transparent text-text hover:bg-line-soft active:bg-divider",
  danger: "border-bad bg-bad text-on-bad hover:brightness-90 active:brightness-75",
  ghost: "border-transparent bg-transparent text-acc-text hover:bg-acc-tint active:bg-acc-tint",
  icon: "min-w-11 border-divider bg-transparent text-ink-2 hover:bg-line-soft hover:text-text active:bg-divider",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-1.5 text-sm lg:min-h-9",
  md: "min-h-11 px-4 py-2 text-base",
  lg: "min-h-12 px-6 py-2 text-lg",
};

export function Button({
  children,
  className,
  disabled,
  frame,
  icon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-heading font-semibold leading-tight transition-colors duration-150",
        frame && "blueprint",
        sizes[size],
        variants[variant],
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      {frame ? <Corners /> : null}
      {icon}
      {children}
    </button>
  );
}
