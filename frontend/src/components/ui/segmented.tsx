import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "../../lib/cn";

type SegmentedOption<T extends string | number> = {
  disabled?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  value: T;
};

type SegmentedProps<T extends string | number> = {
  /** Nombre accesible del grupo (p. ej. "Método de pago"). */
  "aria-label": string;
  className?: string;
  /** Las opciones se reparten el ancho por igual (selector de pago del POS). */
  fullWidth?: boolean;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  value: T;
};

/**
 * Selector segmentado Industry: una fila de opciones con borde fino, la activa rellena de acento.
 * Es un grupo `radiogroup`: ←/→ (y ↑/↓) mueven la selección, como un radio nativo.
 */
export function Segmented<T extends string | number>({
  "aria-label": ariaLabel,
  className,
  fullWidth,
  onChange,
  options,
  size = "md",
  value,
}: SegmentedProps<T>) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    const enabled = options.filter((o) => !o.disabled);
    const index = enabled.findIndex((o) => o.value === value);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    // El foco sigue a la opción elegida
    const group = event.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn("inline-flex border border-field-border", fullWidth && "flex w-full", className)}
      onKeyDown={onKeyDown}
      role="radiogroup"
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            aria-checked={active}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3 font-medium transition-colors duration-150",
              size === "md" ? "min-h-11 text-base" : "min-h-11 text-sm lg:min-h-8",
              fullWidth && "flex-1",
              i > 0 && "border-l border-field-border",
              active ? "bg-accent text-on-acc" : "text-text hover:bg-line-soft",
              option.disabled && "cursor-not-allowed opacity-45",
            )}
            disabled={option.disabled}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            role="radio"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
