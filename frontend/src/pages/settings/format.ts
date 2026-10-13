/** Utilidades de presentación de la pantalla de Configuración. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type AuditTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function actionTone(action: string): AuditTone {
  if (action === "create" || action === "login") return "success";
  if (action === "delete" || action === "restore") return "danger";
  if (action === "cancel") return "warning";
  if (action === "update") return "accent";
  return "neutral";
}

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  create: "Crear",
  update: "Actualizar",
  delete: "Eliminar",
  cancel: "Cancelar",
  verify: "Verificar",
  download: "Descargar",
  restore: "Restaurar",
};

const ENTITY_LABELS: Record<string, string> = {
  sale: "Venta",
  product: "Producto",
  user: "Usuario",
  inventory: "Inventario",
  purchase_order: "Orden de compra",
  backup: "Respaldo",
  config: "Configuración",
};

export const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));
export const ENTITY_OPTIONS = Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }));

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

/** Subtotal del ticket de ejemplo en centavos enteros: 331.00. */
export const PREVIEW_SUBTOTAL_CENTS = 33100;

/** IVA del ticket de ejemplo en centavos, a partir del texto del campo (inválido o negativo = 0). */
export function previewTaxCents(rate: string): number {
  const n = Number.parseFloat(rate);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((PREVIEW_SUBTOTAL_CENTS * n) / 100);
}
