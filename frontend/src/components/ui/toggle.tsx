import { cn } from "../../lib/cn";

type ToggleProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function Toggle({ checked, disabled, label, onChange }: ToggleProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-55")}>
      <button
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/50",
          checked ? "bg-primary" : "bg-neutral-border-strong",
        )}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      <span className="text-sm font-medium text-neutral-text-primary">{label}</span>
    </label>
  );
}
