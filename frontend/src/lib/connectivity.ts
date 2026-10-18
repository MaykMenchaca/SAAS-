import { isAxiosError } from "axios";

import { isMaintenanceError } from "../api/backup";

/**
 * El servidor NO procesó la petición: sin red o timeout (sin respuesta), puerta de enlace caída (502/504),
 * base de datos caída (503 de /api/health) o restauración en curso (503 de mantenimiento). En esos casos la
 * caja trabaja con su copia local y encola las ventas (RF-10). Un 500 genérico NO entra aquí: puede ser un
 * error del servidor después de haber procesado algo, y se muestra al usuario.
 */
export function isServerUnavailable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (!error.response) return true;
  return [502, 503, 504].includes(error.response.status) || isMaintenanceError(error);
}

/** Resultado del ping a /api/health: cualquier 5xx (incluida la base caída) cuenta como "sin servidor". */
export function isReachableHealthError(error: unknown): boolean {
  return isAxiosError(error) && Boolean(error.response) && (error.response?.status ?? 0) < 500;
}
