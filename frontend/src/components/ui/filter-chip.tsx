import { cn } from "../../lib/cn";

type FilterChipProps = {
  active?: boolean;
  className?: string;
  label: string;
  onClick: () => void;
};

/** Chip de filtro/categoría Industry: cuadrado, borde fino; el activo se rellena de acento. */
export function FilterChip({ active, className, label, onClick }: FilterChipProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 items-center whitespace-nowrap border px-3 font-heading text-base font-semibold transition-colors duration-150",
        active
          ? "border-accent bg-accent text-on-acc"
          : "border-divider bg-transparent text-text hover:bg-line-soft",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
