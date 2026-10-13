import { useId } from "react";
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
  const errorId = useId();

  return (
    <label className="grid gap-1.5 text-sm font-medium text-ink-2" htmlFor={selectId}>
      {label ? <span>{label}</span> : null}
      <span className="relative block">
        <select
          className={cn(
            "min-h-11 w-full appearance-none border border-field-border bg-surface px-3 py-2 pr-9 text-base text-text transition-colors hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
            error && "border-bad focus-visible:border-bad",
            className,
          )}
          disabled={disabled}
          id={selectId}
          name={name}
          {...props}
          aria-describedby={error ? errorId : props["aria-describedby"]}
          aria-invalid={error ? true : props["aria-invalid"]}
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
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-2"
          size={16}
        />
      </span>
      {error ? <span className="text-xs font-medium text-bad" id={errorId}>{error}</span> : null}
    </label>
  );
}
