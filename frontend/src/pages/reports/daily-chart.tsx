import { formatCurrency } from "../../lib/formatters";
import { cn } from "../../lib/cn";
import type { DailyPoint } from "./helpers";
import { formatShortDate, parseLocalDate } from "./helpers";

/** Barras de ingreso por día; la última (el día más reciente) va en acento y las demás en tono suave. */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) return null;

  const values = data.map((d) => Number(d.revenue));
  const max = Math.max(...values, 0);
  const denseLabels = data.length > 14;
  const labelFor = (index: number) =>
    denseLabels
      ? index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2)
        ? formatShortDate(data[index].date)
        : ""
      : String(parseLocalDate(data[index].date).getDate());

  return (
    <div
      aria-label={`Ingreso diario del ${formatShortDate(data[0].date)} al ${formatShortDate(data[data.length - 1].date)}; máximo ${formatCurrency(max)}`}
      className="w-full"
      role="img"
    >
      <div className="flex h-56 items-end gap-1.5 px-4 pt-5">
        {data.map((day, index) => (
          <div
            className={cn("min-w-0 flex-1", index === data.length - 1 ? "bg-accent" : "bg-acc-tint border-t-2 border-accent")}
            key={day.date}
            style={{ height: `${max > 0 ? Math.max((values[index] / max) * 100, values[index] > 0 ? 2 : 0) : 0}%` }}
            title={`${formatShortDate(day.date)}: ${formatCurrency(day.revenue)} (${day.count} ${day.count === 1 ? "venta" : "ventas"})`}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-divider px-4 pb-3.5 pt-2">
        {data.map((day, index) => (
          <span
            className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-xs tabular-nums text-ink-2"
            key={day.date}
          >
            {labelFor(index)}
          </span>
        ))}
      </div>
    </div>
  );
}
