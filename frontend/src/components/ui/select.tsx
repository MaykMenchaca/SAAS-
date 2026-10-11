import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/cn";

type SelectOption = {
  label: string;
  value: string | number;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  error?: string;
  label?: string;
  options: SelectOption[];
  placeholder?: string;
};

export function Select({
  className,
  disabled,
  error,
  id,
  label,
  name,
  options,
  placeholder,
  ...props
}: SelectProps) {
  const selectId = id ?? name;

  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary" htmlFor={selectId}>
      {label ? <span>{label}</span> : null}
      <span className="relative block">
        <select
          className={cn(
            "min-h-11 w-full appearance-none rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 pr-9 text-sm text-neutral-text-primary outline-none transition-colors placeholder:text-neutral-text-muted focus:border-primary-text focus:ring-2 focus:ring-primary-text/60 disabled:cursor-not-allowed disabled:bg-neutral-bg",
            error && "border-danger focus:border-danger focus:ring-danger/20",
            className,
          )}
          disabled={disabled}
          id={selectId}
          name={name}
          {...props}
        >
          {placeholder ? (
            <option value="">{placeholder}</option>
          ) : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-text-muted"
          size={16}
        />
      </span>
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}
