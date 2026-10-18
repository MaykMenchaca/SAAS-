import { AxiosError } from "axios";

export type Tab = "ordenes" | "proveedores";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Estados de la orden y su etiqueta. El orden es el del filtro de la pantalla. */
export const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  parcial: "Parcial",
  recibida: "Recibida",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export function statusTone(status: string): BadgeTone {
  if (status === "recibida") return "success";
  if (status === "enviada") return "accent";
  if (status === "parcial") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Se puede registrar recepción solo en órdenes enviadas o con recepción parcial. */
export function canReceiveStatus(status: string): boolean {
  return status === "enviada" || status === "parcial";
}

/** Se puede cancelar una orden en borrador o enviada (igual que antes del rediseño). */
export function canCancelStatus(status: string): boolean {
  return status === "borrador" || status === "enviada";
}

/** Una orden con recepción parcial se cierra sin esperar lo pendiente; ya no se cancela (RF-22). */
export function canCloseStatus(status: string): boolean {
  return status === "parcial";
}

/** Id del proveedor inactivo dueño del RFC, si el alta chocó con él (409 `supplier_inactive`, RF-21). */
export function inactiveSupplierId(error: unknown): number | null {
  if (!(error instanceof AxiosError)) return null;
  const data = error.response?.data;
  return data?.code === "supplier_inactive" && typeof data.supplier_id === "number" ? data.supplier_id : null;
}

/**
 * Fecha para mostrar. Las fechas de solo día ("2026-10-14", como `expected_date`) se interpretan
 * en hora local: `new Date("2026-10-14")` es medianoche UTC y en México mostraría el día anterior.
 */
export function formatShortDate(value: string | null | undefined, withYear = true): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Mensajes de un objeto `details` de validación, aplanados (las partidas vienen anidadas por índice). */
function detailMessages(details: unknown): string[] {
  if (typeof details === "string") return [details];
  if (Array.isArray(details)) return details.flatMap(detailMessages);
  if (details && typeof details === "object") return Object.values(details).flatMap(detailMessages);
  return [];
}

/**
 * Mensaje de error del servidor (o el de respaldo). En un 422 muestra los detalles: antes solo se veía
 * "Datos inválidos" para un RFC mal escrito o una orden sin productos (RF-37, RF-38).
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error) return "";
  if (error instanceof AxiosError) {
    const details = detailMessages(error.response?.data?.details);
    if (details.length > 0) return [...new Set(details)].join(" ");
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}

/** RFC del SAT: 12 caracteres (persona moral) o 13 (persona física), mismo patrón que el servidor (RF-37). */
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{3}$/;

export function isValidRfc(rfc: string): boolean {
  return RFC_PATTERN.test(rfc.trim().toUpperCase());
}

/** Campo numérico compacto para las tablas (cantidad, costo, IVA, recibir). */
export const cellInputClass =
  "min-h-11 w-24 border border-field-border bg-surface px-2 py-1 text-right tabular-nums text-text transition-colors hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9";
