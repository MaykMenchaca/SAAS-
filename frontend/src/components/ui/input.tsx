import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  icon?: ReactNode;
  label: string;
};

export function Input({ className, error, icon, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const hasIcon = Boolean(icon);

  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary" htmlFor={inputId}>
      <span>{label}</span>
      <span className="relative block">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-text-muted">
            {icon}
          </span>
        ) : null}
        <input
          className={cn(
            "min-h-11 w-full rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm text-neutral-text-primary outline-none transition-colors placeholder:text-neutral-text-muted focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:bg-neutral-bg",
            hasIcon && "pl-10",
            error && "border-danger focus:border-danger focus:ring-danger/20",
            className,
          )}
          id={inputId}
          {...props}
        />
      </span>
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}
