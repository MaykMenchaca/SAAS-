import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useEffect } from "react";
import { toast } from "sonner";

import { qk } from "../api/query-keys";
import { getSession } from "../api/sales";
import { useAuthStore } from "../stores/auth-store";
import { usePosStore } from "../stores/pos-store";
import { PosTerminal } from "./pos/pos-terminal";
import { SessionSelector } from "./pos/session-selector";

// Los billetes de los atajos de pago viven en pos/payment-math.ts; se reexportan para quien ya los importaba
export { MXN_BILL_DENOMINATIONS } from "./pos/payment-math";

/**
 * Punto de venta. Valida que la sesión de caja guardada siga abierta y sea del usuario (H-18) y muestra el
 * selector de caja o el terminal de venta. El diseño y la lógica de cada parte viven en `pages/pos/`.
 */
export function PosPage() {
  const sessionId = usePosStore((s) => s.sessionId);
  const clearSession = usePosStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);

  const sessionQuery = useQuery({
    queryKey: qk.activePosSession(sessionId),
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 10_000,
    // Sin reintentos por foco: con el servidor caído no debe interrumpir la venta en curso
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!sessionId || sessionQuery.isLoading || !sessionQuery.data) return;

    const session = sessionQuery.data;
    const isOwner = session.user_id === user?.id;
    const canSupervise = user?.role === "admin" || user?.permissions?.includes("caja:supervisar");

    if (session.status !== "abierta" || (!isOwner && !canSupervise)) {
      clearSession();
      toast.warning("La sesión de caja ya no está abierta o pertenece a otro usuario.");
    }
  }, [sessionId, sessionQuery.data, sessionQuery.isLoading, user?.id, user?.role, user?.permissions, clearSession]);

  useEffect(() => {
    // Solo se descarta la sesión si el servidor la rechazó (no existe o no es accesible).
    // Con la red caída, un timeout o un 5xx se conservan la sesión y el carrito (OPS-01, H-24).
    const status = sessionQuery.error instanceof AxiosError ? sessionQuery.error.response?.status : undefined;
    if (status === 404 || status === 403) {
      clearSession();
      toast.warning("La sesión de caja ya no existe o no tienes acceso a ella.");
    }
  }, [sessionQuery.error, clearSession]);

  if (sessionId && sessionQuery.isLoading) {
    return (
      <div aria-label="Cargando la caja" className="grid min-h-[calc(100dvh-4rem)] place-items-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return sessionId ? <PosTerminal /> : <SessionSelector />;
}
