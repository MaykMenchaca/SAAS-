import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  icon?: ReactNode;
  label: string;
};

/** Campo de texto Industry: relleno `surface`, borde de 3:1 (`field-border`) y foco con borde de acento. */
export function Input({ className, error, icon, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const errorId = useId();
  const hasIcon = Boolean(icon);

  return (
    <label className="grid gap-1.5 text-sm font-medium text-ink-2" htmlFor={inputId}>
      <span>{label}</span>
      <span className="relative block">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-2">
            {icon}
          </span>
        ) : null}
        <input
          className={cn(
            "min-h-11 w-full border border-field-border bg-surface px-3 py-2 text-base text-text transition-colors placeholder:text-ink-2 hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
            hasIcon && "pl-10",
            error && "border-bad focus-visible:border-bad",
            className,
          )}
          id={inputId}
          {...props}
          aria-describedby={error ? errorId : props["aria-describedby"]}
          aria-invalid={error ? true : props["aria-invalid"]}
        />
      </span>
      {error ? <span className="text-xs font-medium text-bad" id={errorId}>{error}</span> : null}
    </label>
  );
}
