import { cn } from "../../lib/cn";

type FilterChipProps = {
  active?: boolean;
  className?: string;
  label: string;
  onClick: () => void;
};

export function FilterChip({ active, className, label, onClick }: FilterChipProps) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-outline bg-neutral-surface-raised text-neutral-text-primary"
          : "border-neutral-border bg-transparent text-neutral-text-secondary hover:bg-neutral-surface-raised/50",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
