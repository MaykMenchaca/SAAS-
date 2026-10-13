import { cn } from "../../lib/cn";

type ToggleProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

/** Interruptor Industry: pista y pulgar cuadrados, activo relleno de acento. */
export function Toggle({ checked, disabled, label, onChange }: ToggleProps) {
  return (
    <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-45")}>
      <button
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors duration-150",
          checked ? "border-accent bg-accent" : "border-field-border bg-transparent",
        )}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transition-transform duration-150",
            checked ? "translate-x-6 bg-on-acc" : "translate-x-1 bg-ink-2",
          )}
        />
      </button>
      <span className="text-sm font-medium text-text">{label}</span>
    </label>
  );
}
