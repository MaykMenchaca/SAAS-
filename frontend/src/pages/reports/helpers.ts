import { addLocalDays, localISODate } from "../../lib/dates";
import { formatCurrency } from "../../lib/formatters";

export type DailyPoint = { date: string; count: number; revenue: string };

export type Preset = "7" | "14" | "30" | "month" | "year";

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "7", label: "7 días" },
  { id: "14", label: "14 días" },
  { id: "30", label: "30 días" },
  { id: "month", label: "Este mes" },
  { id: "year", label: "Este año" },
];

/** Rango (YYYY-MM-DD, hora local) que cubre cada atajo; los atajos de N días incluyen hoy. */
export function presetRange(preset: Preset, now: Date = new Date()): { from: string; to: string } {
  const to = localISODate(now);
  switch (preset) {
    case "month":
      return { from: localISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "year":
      return { from: localISODate(new Date(now.getFullYear(), 0, 1)), to };
    default:
      return { from: localISODate(addLocalDays(now, -(Number(preset) - 1))), to };
  }
}

/** Atajo cuyo rango coincide con el de los campos Desde/Hasta (o `null` si el rango es personalizado). */
export function matchPreset(from: string, to: string, now: Date = new Date()): Preset | null {
  return PRESETS.find((p) => {
    const range = presetRange(p.id, now);
    return range.from === from && range.to === to;
  })?.id ?? null;
}

/** La fecha inicial no puede ser posterior a la final (H-49). */
export function validateRange(from: string, to: string): string {
  if (from && to && from > to) return "La fecha inicial debe ser anterior o igual a la final.";
  return "";
}

/** "2026-10-06" como fecha local (sin desfase de zona horaria). */
export function parseLocalDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatShortDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function formatLongDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Rellena con 0 los días sin ventas para que la gráfica no salte días (H-49). Máximo 366 días. */
export function fillMissingDays(daily: DailyPoint[], from: string, to: string): DailyPoint[] {
  if (!from || !to || from > to) return daily;
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const out: DailyPoint[] = [];
  let cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cursor <= end && out.length < 366) {
    const iso = localISODate(cursor);
    out.push(byDate.get(iso) ?? { date: iso, count: 0, revenue: "0.00" });
    cursor = addLocalDays(cursor, 1);
  }
  return out;
}

/** Importe con el signo delante ("-$116.00"): con devoluciones, un día o un método puede quedar en negativo (RF-25). */
export function formatSignedCurrency(amount: string | number): string {
  const n = Number(amount);
  if (Number.isFinite(n) && n < 0) return `-${formatCurrency(-n)}`;
  return formatCurrency(amount);
}

/** Clase de color para un importe negativo (salida neta por reembolsos). */
export function negativeTone(amount: string | number): string {
  return Number(amount) < 0 ? "text-bad" : "";
}

/** Participación (0-100) de cada valor sobre la suma de todos; vacío o suma 0 → ceros. */
export function shares(values: number[]): number[] {
  const total = values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => ((Number.isFinite(v) ? v : 0) / total) * 100);
}

/** Ticket promedio en pesos a partir de cadenas/números del servidor (solo presentación). */
export function averageTicket(totalRevenue: string | number, totalSales: number): number {
  const revenue = Number(totalRevenue);
  if (!totalSales || !Number.isFinite(revenue)) return 0;
  return revenue / totalSales;
}
