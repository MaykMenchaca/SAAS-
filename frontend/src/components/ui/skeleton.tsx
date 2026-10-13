import { cn } from "../../lib/cn";

/** Base skeleton pulse rectangle. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse bg-divider", className)}
    />
  );
}

/** Skeleton placeholder for KPI cards. */
export function SkeletonKPI({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "border border-divider p-4",
        className,
      )}
    >
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-7 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Skeleton placeholder for data tables. */
export function SkeletonTable({
  cols = 4,
  rows = 6,
}: {
  cols?: number;
  rows?: number;
}) {
  return (
    <div aria-hidden="true" className="overflow-hidden border border-divider">
      {/* Header row */}
      <div className="flex gap-4 border-b border-divider px-3 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton className="h-3 flex-1" key={`h${c}`} />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          className="flex gap-4 border-b border-line-soft px-3 py-3 last:border-b-0"
          key={`r${r}`}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              className={cn("h-4 flex-1", c === 0 && "max-w-48")}
              key={`c${c}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
