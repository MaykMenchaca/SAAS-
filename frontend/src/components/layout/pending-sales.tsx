import { useState } from "react";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { syncOfflineQueue } from "../../hooks/useSyncQueue";
import { formatCurrency } from "../../lib/formatters";
import { useAuthStore } from "../../stores/auth-store";
import { useConnectionStore } from "../../stores/connection-store";
import type { RejectedOfflineSale } from "../../stores/pos-store";
import { queuedSaleId, usePosStore } from "../../stores/pos-store";
import { Badge, Button, Modal } from "../ui";

function formatQueuedAt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Indicador "N ventas pendientes" en el header, con bandeja de ventas pendientes y rechazadas (H-24). */
export function PendingSalesIndicator() {
  const userId = useAuthStore((s) => s.user?.id);
  const queue = usePosStore((s) => s.offlineSalesQueue);
  const rejected = usePosStore((s) => s.rejectedSales);
  const syncing = useConnectionStore((s) => s.syncing);
  const [open, setOpen] = useState(false);

  const belongsToUser = (item: { userId: number }) => !item.userId || item.userId === userId;
  const pending = queue.filter(belongsToUser);
  const rejectedForUser = rejected.filter(belongsToUser);
  const count = pending.length + rejectedForUser.length;

  if (count === 0) return null;

  const label =
    rejectedForUser.length > 0
      ? `${pending.length} pendientes, ${rejectedForUser.length} rechazadas`
      : `${pending.length} ${pending.length === 1 ? "venta pendiente" : "ventas pendientes"}`;

  return (
    <>
      <Button
        aria-label={`${label}. Ver detalle`}
        className="min-h-0 h-9 px-3 text-xs"
        icon={<CloudOff aria-hidden="true" size={14} />}
        onClick={() => setOpen(true)}
        variant={rejectedForUser.length > 0 ? "danger" : "secondary"}
      >
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{count}</span>
      </Button>
      {open ? (
        <PendingSalesModal
          onClose={() => setOpen(false)}
          pending={pending}
          rejected={rejectedForUser}
          syncing={syncing}
        />
      ) : null}
    </>
  );
}

function PendingSalesModal({
  pending,
  rejected,
  syncing,
  onClose,
}: {
  pending: ReturnType<typeof usePosStore.getState>["offlineSalesQueue"];
  rejected: RejectedOfflineSale[];
  syncing: boolean;
  onClose: () => void;
}) {
  const discardRejectedSale = usePosStore((s) => s.discardRejectedSale);
  const [toDiscard, setToDiscard] = useState<RejectedOfflineSale | null>(null);

  async function handleRetry() {
    await syncOfflineQueue();
    if (usePosStore.getState().offlineSalesQueue.length > 0) {
      toast.warning("Aún no hay conexión con el servidor. Se reintentará automáticamente.");
    }
  }

  function confirmDiscard() {
    if (!toDiscard) return;
    discardRejectedSale(queuedSaleId(toDiscard));
    setToDiscard(null);
    toast.success("Venta rechazada descartada.");
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          {pending.length > 0 ? (
            <Button disabled={syncing} icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void handleRetry()}>
              {syncing ? "Sincronizando..." : "Reintentar ahora"}
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title="Ventas sin sincronizar"
    >
      <div className="grid gap-5">
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-neutral-text-primary">Pendientes de enviar ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="text-sm text-neutral-text-secondary">No hay ventas pendientes.</p>
          ) : (
            <ul className="grid gap-1.5">
              {pending.map((item) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-border px-3 py-2 text-sm"
                  key={queuedSaleId(item)}
                >
                  <span className="text-neutral-text-secondary">{formatQueuedAt(item.queuedAt)}</span>
                  <span className="text-neutral-text-secondary">{item.sale.items.length} artículo(s)</span>
                  <span className="font-mono font-semibold">{item.total ? formatCurrency(item.total) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {rejected.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold text-danger">Rechazadas por el servidor ({rejected.length})</h3>
            <p className="text-sm text-neutral-text-secondary">
              Estas ventas no se registraron. Verifica el motivo, vuelve a capturarlas si corresponde y descártalas.
            </p>
            <ul className="grid gap-2">
              {rejected.map((item) => (
                <li
                  className="grid gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm"
                  key={queuedSaleId(item)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-neutral-text-secondary">Cobrada: {formatQueuedAt(item.queuedAt)}</span>
                    <span className="font-mono font-semibold">{item.total ? formatCurrency(item.total) : "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="danger">{item.error}</Badge>
                    <Button
                      className="min-h-0 h-8 px-3 text-xs"
                      icon={<Trash2 aria-hidden="true" size={14} />}
                      onClick={() => setToDiscard(item)}
                      variant="ghost"
                    >
                      Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {toDiscard ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setToDiscard(null)} variant="secondary">
                Conservar
              </Button>
              <Button onClick={confirmDiscard} variant="danger">
                Descartar venta
              </Button>
            </>
          }
          onClose={() => setToDiscard(null)}
          open
          title="¿Descartar la venta rechazada?"
        >
          <p className="text-sm text-neutral-text-secondary">
            Se eliminará de este equipo la venta de {toDiscard.total ? formatCurrency(toDiscard.total) : "monto desconocido"}.
            Esta acción no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </Modal>
  );
}
