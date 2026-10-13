import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "../../components/ui";
import { useAuthStore } from "../../stores/auth-store";
import { useConnectionStore } from "../../stores/connection-store";
import { usePosStore } from "../../stores/pos-store";

/** Avisos de conexión del POS (subfase 4.9): sin servidor, sincronizando y "N ventas sincronizadas". */
export function OfflineBanner() {
  const serverReachable = useConnectionStore((s) => s.serverReachable);
  const syncing = useConnectionStore((s) => s.syncing);
  const userId = useAuthStore((s) => s.user?.id);
  const pending = usePosStore((s) => s.offlineSalesQueue.filter((q) => !q.userId || q.userId === userId).length);
  const [justSynced, setJustSynced] = useState<number | null>(null);
  const lastPending = useRef(pending);

  // Al terminar una sincronización que vació parte de la cola, se avisa 5 s ("3 ventas sincronizadas")
  useEffect(() => {
    if (!syncing && serverReachable && lastPending.current > pending) {
      setJustSynced(lastPending.current - pending);
      const timer = setTimeout(() => setJustSynced(null), 5000);
      lastPending.current = pending;
      return () => clearTimeout(timer);
    }
    lastPending.current = pending;
  }, [syncing, serverReachable, pending]);

  if (!serverReachable) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-bad bg-bad-tint px-4 py-2.5 text-bad sm:px-6" role="alert">
        <WifiOff aria-hidden="true" className="shrink-0" size={18} />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Sin conexión al servidor.</span>{" "}
          <span className="text-text">Puedes seguir vendiendo: las ventas se guardan en esta caja y se envían al volver la red.</span>
        </div>
        <Badge className="shrink-0 whitespace-nowrap border border-bad bg-bg text-bad" tone="neutral">
          {pending === 0 ? "0 ventas pendientes" : `${pending} ${pending === 1 ? "venta pendiente" : "ventas pendientes"} de enviar`}
        </Badge>
      </div>
    );
  }

  if (syncing && pending > 0) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 border-b border-ok bg-ok-tint px-4 py-2.5 text-sm text-ok sm:px-6" role="status">
        <RefreshCw aria-hidden="true" className="shrink-0 animate-spin" size={16} />
        <span>
          Conexión restablecida. Sincronizando {pending} {pending === 1 ? "venta guardada" : "ventas guardadas"} en esta caja…
        </span>
      </div>
    );
  }

  if (justSynced) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 border-b border-ok bg-ok-tint px-4 py-2.5 text-sm text-ok sm:px-6" role="status">
        <RefreshCw aria-hidden="true" className="shrink-0" size={16} />
        <span>
          {justSynced} {justSynced === 1 ? "venta sincronizada" : "ventas sincronizadas"} con el servidor.
        </span>
      </div>
    );
  }

  return null;
}
