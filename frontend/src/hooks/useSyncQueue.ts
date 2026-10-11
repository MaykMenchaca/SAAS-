import { useEffect } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";

import { apiClient } from "../api/client";
import { invalidateAfterSale } from "../api/invalidate";
import { createSale } from "../api/sales";
import { queryClient } from "../lib/query-client";
import { useAuthStore } from "../stores/auth-store";
import { useConnectionStore } from "../stores/connection-store";
import { queuedSaleId, usePosStore } from "../stores/pos-store";

const HEALTH_INTERVAL_MS = 30_000;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

// Estado a nivel de módulo: un solo sincronizador aunque el hook se monte más de una vez (H-24).
let inFlight: Promise<void> | null = null;
let backoffMs = INITIAL_BACKOFF_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function errorMessage(error: unknown) {
  if (isAxiosError(error)) {
    return (error.response?.data as { error?: string } | undefined)?.error ?? `Error ${error.response?.status ?? ""}`.trim();
  }
  return "Error desconocido";
}

/** Errores de sesión, no de la venta: token inválido (422 {msg}) o contraseña/usuario (403 con code). */
function isAuthError(error: unknown) {
  if (!isAxiosError(error) || !error.response) return false;
  const { status, data } = error.response;
  if (status === 401) return true;
  if (status === 422 && typeof data?.msg === "string" && !data?.error) return true;
  return status === 403 && ["password_change_required", "user_inactive"].includes(data?.code);
}

/**
 * 4xx (salvo 401/408/429 y errores de sesión) = el servidor rechazó la venta; reintentar no la
 * arreglará. Un problema de sesión no es culpa de la venta: no se rechaza, se reintenta (FE-105).
 */
function isPermanentRejection(error: unknown) {
  if (!isAxiosError(error) || !error.response || isAuthError(error)) return false;
  const status = error.response.status;
  return status >= 400 && status < 500 && ![408, 429].includes(status);
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncOfflineQueue();
  }, delay);
}

/**
 * Envía en orden las ventas encoladas del usuario activo. Cada venta lleva su client_uuid, así que
 * un reintento después de un timeout no la duplica en el servidor.
 */
export function syncOfflineQueue(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    const pending = usePosStore
      .getState()
      .offlineSalesQueue.filter((item) => !item.userId || item.userId === userId);
    if (pending.length === 0) {
      backoffMs = INITIAL_BACKOFF_MS;
      return;
    }

    const connection = useConnectionStore.getState();
    connection.setSyncing(true);
    let synced = 0;
    let rejected = 0;

    try {
      for (const item of pending) {
        const id = queuedSaleId(item);
        try {
          await createSale({ ...item.sale, open_drawer: false });
          usePosStore.getState().removeOfflineSaleByUuid(id);
          synced++;
        } catch (error) {
          if (isPermanentRejection(error)) {
            usePosStore.getState().rejectOfflineSale(id, errorMessage(error));
            rejected++;
            continue;
          }
          // Red caída, timeout o 5xx: se conserva la venta y se reintenta con backoff.
          if (isAxiosError(error) && !error.response) {
            connection.setServerReachable(false);
          }
          scheduleRetry();
          return;
        }
      }
      backoffMs = INITIAL_BACKOFF_MS;
      connection.setServerReachable(true);
    } finally {
      connection.setSyncing(false);
      if (synced > 0) {
        void invalidateAfterSale(queryClient);
        toast.success(`Se sincronizaron ${synced} venta(s) pendientes.`);
      }
      if (rejected > 0) {
        toast.error(`${rejected} venta(s) fueron rechazadas por el servidor. Revísalas en "Ventas pendientes".`);
      }
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function pingServer() {
  try {
    await apiClient.get("/health", { timeout: 5000 });
    useConnectionStore.getState().setServerReachable(true);
    return true;
  } catch (error) {
    // Cualquier respuesta HTTP significa que el servidor está en la red.
    const reachable = isAxiosError(error) && Boolean(error.response);
    useConnectionStore.getState().setServerReachable(reachable);
    return reachable;
  }
}

/**
 * Monta el sincronizador global: ping a /api/health cada 30 s y sincroniza la cola cuando el
 * servidor responde, cuando vuelve la red o cuando se encola una venta nueva.
 */
export function useSyncQueue() {
  const userId = useAuthStore((s) => s.user?.id);
  const queueLength = usePosStore((s) => s.offlineSalesQueue.length);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const reachable = await pingServer();
      if (!cancelled && reachable) void syncOfflineQueue();
    }

    function handleOffline() {
      useConnectionStore.getState().setServerReachable(false);
    }

    void check();
    const interval = setInterval(check, HEALTH_INTERVAL_MS);
    window.addEventListener("online", check);
    window.addEventListener("offline", handleOffline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (userId && queueLength > 0 && useConnectionStore.getState().serverReachable) {
      void syncOfflineQueue();
    }
  }, [userId, queueLength]);
}
