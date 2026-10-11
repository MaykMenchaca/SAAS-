import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../../lib/cn";

type PaginationProps = {
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
};

function pageRange(current: number, total: number): (number | "...")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}

const btnBase =
  "relative inline-flex h-8 min-w-8 before:absolute before:inset-[-6px] before:content-[''] items-center justify-center rounded-md border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:pointer-events-none";

export function Pagination({ onPageChange, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageRange(page, totalPages);

  return (
    <nav aria-label="Paginación" className="flex items-center gap-1">
      <button
        aria-label="Anterior"
        className={cn(btnBase, "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:bg-neutral-surface-raised")}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft size={14} />
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span className="px-1 text-xs text-neutral-text-muted" key={`e${i}`}>
            ...
          </span>
        ) : (
          <button
            className={cn(
              btnBase,
              p === page
                ? "border-primary bg-primary text-on-primary"
                : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:bg-neutral-surface-raised",
            )}
            key={p}
            onClick={() => onPageChange(p)}
            type="button"
          >
            {p}
          </button>
        ),
      )}

      <button
        aria-label="Siguiente"
        className={cn(btnBase, "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:bg-neutral-surface-raised")}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
