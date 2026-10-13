import { Corners, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";

export type Kpi = { label: string; tone?: "bad" | "ok"; value: string };

/** Fila de cifras grandes separadas por una línea fina (una columna por KPI). */
export function KpiStrip({ isLoading, kpis }: { isLoading?: boolean; kpis: Kpi[] }) {
  return (
    <section
      aria-label="Resumen"
      className={cn(
        "blueprint relative grid grid-cols-2 gap-px bg-divider",
        kpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
      )}
    >
      <Corners />
      {kpis.map((kpi) => (
        <div className="flex min-w-0 flex-col gap-1.5 bg-bg px-4 py-4" key={kpi.label}>
          <span className="font-heading text-sm font-semibold uppercase tracking-wider text-ink-2">{kpi.label}</span>
          {isLoading ? (
            <Skeleton className="h-9 w-28" />
          ) : (
            <span
              className={cn(
                "break-words font-heading text-3xl font-semibold leading-none tabular-nums sm:text-4xl",
                kpi.tone === "bad" ? "text-bad" : kpi.tone === "ok" ? "text-ok" : "text-text",
              )}
            >
              {kpi.value}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
