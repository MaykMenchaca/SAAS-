import { cn } from "../../lib/cn";

type Kpi = { label: string; tone?: "warn" | "bad"; value: string };

/** Fila de indicadores: productos, bajo mínimo, agotados y valor a costo. */
export function StockKpis({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px border border-divider bg-divider lg:grid-cols-4">
      {items.map((kpi) => (
        <div className="min-w-0 bg-bg px-4 py-3.5" key={kpi.label}>
          <dt className="text-sm text-ink-2">{kpi.label}</dt>
          <dd
            className={cn(
              "break-words font-heading text-3xl font-semibold leading-tight tabular-nums",
              kpi.tone === "warn" && "text-warn",
              kpi.tone === "bad" && "text-bad",
            )}
          >
            {kpi.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
