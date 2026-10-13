import type { SaleFilters } from "../../api/sales";
import { addLocalDays, localISODate } from "../../lib/dates";

export type RangeKey = "todo" | "hoy" | "ayer" | "7dias" | "mes" | "rango";
export type StatusKey = "todas" | "completadas" | "devoluciones" | "canceladas";

export const RANGE_OPTIONS: Array<{ label: string; value: RangeKey }> = [
  { label: "Todo", value: "todo" },
  { label: "Hoy", value: "hoy" },
  { label: "Ayer", value: "ayer" },
  { label: "7 días", value: "7dias" },
  { label: "Este mes", value: "mes" },
  { label: "Fechas", value: "rango" },
];

export const STATUS_OPTIONS: Array<{ label: string; value: StatusKey }> = [
  { label: "Todas", value: "todas" },
  { label: "Completadas", value: "completadas" },
  { label: "Devoluciones", value: "devoluciones" },
  { label: "Canceladas", value: "canceladas" },
];

const STATUS_PARAM: Record<StatusKey, string | undefined> = {
  todas: undefined,
  completadas: "completada",
  devoluciones: "devolucion_parcial,devolucion_total",
  canceladas: "cancelada",
};

export type FilterState = {
  range: RangeKey;
  status: StatusKey;
  userId: number | null;
  folio: string;
  from: string;
  to: string;
};

export const INITIAL_FILTERS: FilterState = { range: "todo", status: "todas", userId: null, folio: "", from: "", to: "" };

/** Traduce los filtros de pantalla a los parámetros de la API (días en hora local). */
export function toApiFilters(f: FilterState, now: Date = new Date()): SaleFilters {
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (f.range === "hoy") {
    dateFrom = dateTo = localISODate(now);
  } else if (f.range === "ayer") {
    dateFrom = dateTo = localISODate(addLocalDays(now, -1));
  } else if (f.range === "7dias") {
    dateFrom = localISODate(addLocalDays(now, -6));
    dateTo = localISODate(now);
  } else if (f.range === "mes") {
    dateFrom = localISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    dateTo = localISODate(now);
  } else if (f.range === "rango") {
    dateFrom = f.from || undefined;
    dateTo = f.to || undefined;
  }
  return { status: STATUS_PARAM[f.status], userId: f.userId, folio: f.folio.trim() || undefined, dateFrom, dateTo };
}

/** Error del rango personalizado, o "" si es válido. */
export function rangeError(f: FilterState): string {
  return f.range === "rango" && f.from && f.to && f.from > f.to ? "La fecha inicial no puede ser posterior a la final." : "";
}
