import { AxiosError } from "axios";

export type Tab = "ordenes" | "proveedores";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Estados de la orden y su etiqueta. El orden es el del filtro de la pantalla. */
export const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  parcial: "Parcial",
  recibida: "Recibida",
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

/** Mensaje de error del servidor (o el de respaldo). */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error) return "";
  if (error instanceof AxiosError) return error.response?.data?.error ?? fallback;
  return fallback;
}

/** Campo numérico compacto para las tablas (cantidad, costo, IVA, recibir). */
export const cellInputClass =
  "min-h-11 w-24 border border-field-border bg-surface px-2 py-1 text-right tabular-nums text-text transition-colors hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9";
