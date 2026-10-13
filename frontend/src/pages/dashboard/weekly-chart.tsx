import { addLocalDays, localISODate } from "../../lib/dates";
import { formatCurrency } from "../../lib/formatters";
import type { SalesReport } from "../../api/reports";

export type WeekDay = {
  date: string;
  /** Día de la semana en mayúsculas ("LUN"). */
  day: string;
  /** Número del día del mes. */
  dayNumber: number;
  value: number;
  isToday: boolean;
};

/** Últimos 7 días (el último es hoy) con el ingreso de cada uno según el reporte de ventas. */
export function buildWeek(daily: SalesReport["daily"] | undefined, now: Date = new Date()): WeekDay[] {
  const rows = daily ?? [];
  return Array.from({ length: 7 }).map((_, i) => {
    const d = addLocalDays(now, i - 6);
    const date = localISODate(d);
    const match = rows.find((r) => r.date === date);
    return {
      date,
      day: d.toLocaleDateString("es-MX", { weekday: "short" }).toUpperCase().replace(".", ""),
      dayNumber: d.getDate(),
      value: match ? parseFloat(match.revenue) || 0 : 0,
      isToday: i === 6,
    };
  });
}

/** "$14.4k" para cifras de mil o más; el importe exacto va en el `title` de cada barra. */
export function shortAmount(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export function WeeklyChart({ days }: { days: WeekDay[] }) {
  const max = Math.max(...days.map((d) => d.value), 1);
  const total = days.reduce((sum, d) => sum + d.value, 0);

  return (
    <>
      <div className="grid h-56 grid-cols-7 items-end gap-1.5 px-4 pt-6 sm:gap-3.5 sm:px-5" role="img" aria-label="Ventas de los últimos 7 días">
        {days.map((d) => (
          <div className="flex h-full min-w-0 flex-col items-stretch justify-end gap-1.5" key={d.date} title={`${d.day} ${d.dayNumber}: ${formatCurrency(d.value)}`}>
            <span className={`truncate text-center text-xs tabular-nums ${d.isToday ? "text-text" : "text-ink-2"}`}>{shortAmount(d.value)}</span>
            <div
              className={d.isToday ? "bg-accent" : "bg-accent/40"}
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`, minHeight: 2 }}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 border-t border-divider px-4 pt-2 sm:gap-3.5 sm:px-5">
        {days.map((d) => (
          <span className={`truncate text-center font-heading text-sm font-semibold tracking-wide ${d.isToday ? "text-text" : "text-ink-2"}`} key={d.date}>
            {d.day}<span className="hidden sm:inline"> {d.dayNumber}</span>
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 px-4 py-3.5 text-sm text-ink-2 sm:px-5">
        <span>Promedio diario <span className="font-medium tabular-nums text-text">{formatCurrency(total / 7)}</span></span>
        <span>Total semana <span className="font-heading text-lg font-semibold tabular-nums text-text">{formatCurrency(total)}</span></span>
      </div>
    </>
  );
}
