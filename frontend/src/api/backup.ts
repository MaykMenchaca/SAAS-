import { apiClient } from "./client";

/**
 * Descarga un respaldo con la sesión del administrador (el endpoint exige el token, así que no
 * puede ser un enlace directo) y lo entrega al navegador como archivo.
 */
export async function downloadBackup(filename: string) {
  const response = await apiClient.get<Blob>(`/backup/${encodeURIComponent(filename)}/download`, {
    responseType: "blob",
    // Un respaldo grande tarda más que una consulta normal
    timeout: 120_000,
  });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Restaurar un respaldo (7.4) ─────────────────────────────────────

export type RestoreState = "inactivo" | "en_curso" | "ok" | "error";

export type RestoreStatus = {
  state: RestoreState;
  message: string | null;
  step: string | null;
  filename: string | null;
  started_at: string | null;
  finished_at: string | null;
};

/** Texto exacto que el administrador debe escribir para confirmar la restauración. */
export function restoreConfirmation(filename: string) {
  return `RESTAURAR ${filename}`;
}

export async function restoreBackup(filename: string) {
  const response = await apiClient.post<RestoreStatus>(`/backup/${encodeURIComponent(filename)}/restore`, {
    confirm: restoreConfirmation(filename),
  });
  return response.data;
}

/** Estado de la restauración. Es público y responde aun en mantenimiento. */
export async function getRestoreStatus() {
  const response = await apiClient.get<RestoreStatus>("/backup/restore-status", { timeout: 8000 });
  return response.data;
}

/**
 * Un 503 con `maintenance: true` significa que el servidor está restaurando un respaldo: es "sin
 * servidor" para las cajas (la venta se encola con su client_uuid), no un rechazo de la venta.
 */
export function isMaintenanceError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { maintenance?: boolean } } } | null)?.response;
  return response?.status === 503 && response.data?.maintenance === true;
}
