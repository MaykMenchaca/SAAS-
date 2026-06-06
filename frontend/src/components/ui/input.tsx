import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  label: string;
};

export function Input({ className, error, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary" htmlFor={inputId}>
      <span>{label}</span>
      <input
        className={cn(
          "min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm text-neutral-text-primary outline-none transition-colors placeholder:text-neutral-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-neutral-bg",
          error && "border-danger focus:border-danger focus:ring-danger/20",
          className,
        )}
        id={inputId}
        {...props}
      />
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}
