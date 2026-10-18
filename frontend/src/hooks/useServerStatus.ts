import { useConnectionStore } from "../stores/connection-store";

/**
 * Estado real del servidor: lo actualiza el ping a /api/health del sincronizador (useSyncQueue),
 * no solo navigator.onLine (H-27, H-44).
 */
export function useServerStatus(): boolean {
  return useConnectionStore((s) => s.serverReachable);
}
