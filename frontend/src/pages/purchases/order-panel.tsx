import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, PackageCheck, PackageX, Printer, Send } from "lucide-react";

import type { PurchaseOrder, ReceiveItemInput } from "../../api/purchases";
import { closeOrder, getOrder, receiveOrder, sendOrder } from "../../api/purchases";
import { qk } from "../../api/query-keys";
import { invalidateAfterPurchase } from "../../api/invalidate";
import { useCan } from "../../components/auth/require-permission";
import { Badge, Button, Card, ErrorState, Input, Modal, Skeleton, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatCurrency, formatStock } from "../../lib/formatters";
import { apiErrorMessage, canCancelStatus, canCloseStatus, canReceiveStatus, cellInputClass, formatShortDate, statusLabel, statusTone } from "./helpers";
import { PrintOrder } from "./print-order";

type OrderPanelProps = {
  orderId: number;
  /** Abre la confirmación de cancelación (la confirmación vive en la lista). */
  onRequestCancel: (orderId: number) => void;
};

/**
 * Detalle de la orden seleccionada: partidas, recepción parcial (pedido, recibido, costo, recibir),
 * totales y acciones (Registrar recepción, Enviar al proveedor, Cancelar, Imprimir).
 */
export function OrderPanel({ orderId, onRequestCancel }: OrderPanelProps) {
  const can = useCan();
  const queryClient = useQueryClient();
  const orderQuery = useQuery({
    queryKey: qk.purchaseOrderDetail(orderId),
    queryFn: () => getOrder(orderId),
  });
  const order: PurchaseOrder | undefined = orderQuery.data;

  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [received, setReceived] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");

  const receiveMutation = useMutation({
    mutationFn: (items: ReceiveItemInput[]) => receiveOrder(orderId, items),
    onSuccess: async () => {
      setQuantities({});
      setReceived(true);
      await invalidateAfterPurchase(queryClient);
    },
  });

  // Cerrar una orden parcial: lo recibido se queda, lo pendiente ya no se espera (RF-22)
  const closeMutation = useMutation({
    mutationFn: () => closeOrder(orderId, closeNotes.trim()),
    onSuccess: async () => {
      setConfirmingClose(false);
      setCloseNotes("");
      await invalidateAfterPurchase(queryClient);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => sendOrder(orderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() }),
        queryClient.invalidateQueries({ queryKey: qk.purchaseOrderDetail() }),
        queryClient.invalidateQueries({ queryKey: qk.sidebarPendingPurchases() }),
      ]);
    },
  });

  const header = (
    <header className="flex items-start gap-3 border-b border-divider px-4 py-3.5">
      {order ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-semibold uppercase tracking-widest text-acc-text">{order.folio}</div>
            <h2 className="mt-0.5 text-xl leading-tight">{order.supplier_name}</h2>
            <p className="text-sm text-ink-2">
              Creada {formatShortDate(order.created_at)} · Esperada {formatShortDate(order.expected_date)}
            </p>
            <p className="text-sm text-ink-2">Elaboró {order.username}</p>
          </div>
          <Badge dot tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
        </>
      ) : (
        <h2 className="text-xl">Detalle de la orden</h2>
      )}
    </header>
  );

  if (orderQuery.isLoading) {
    return (
      <Card className="grid gap-3 p-4" frame>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }
  if (orderQuery.isError || !order) {
    return (
      <Card frame>
        {header}
        <ErrorState message="No se pudo cargar la orden." onRetry={() => void orderQuery.refetch()} />
      </Card>
    );
  }

  const receivable = canReceiveStatus(order.status);
  const canRegisterReceipt = receivable && can("compras:recibir");
  const canSend = order.status === "borrador" && can("compras:editar");
  const canCancel = canCancelStatus(order.status) && can("compras:editar");
  const canClose = canCloseStatus(order.status) && can("compras:editar");
  const hasAnyQuantity = Object.values(quantities).some((q) => Number(q) > 0);

  function pendingOf(item: PurchaseOrder["items"][number]) {
    return Math.max(0, Number(item.quantity) - Number(item.received_quantity));
  }

  function fillPending() {
    if (!order) return;
    const next: Record<number, string> = {};
    for (const item of order.items) {
      const pending = pendingOf(item);
      if (pending > 0) next[item.id] = formatStock(pending);
    }
    setQuantities(next);
  }

  function handleReceive() {
    if (!order) return;
    const items: ReceiveItemInput[] = [];
    for (const item of order.items) {
      const qty = quantities[item.id];
      if (qty && Number(qty) > 0) items.push({ order_item_id: item.id, received_quantity: qty });
    }
    if (items.length === 0) return;
    setReceived(false);
    receiveMutation.mutate(items);
  }

  const errorMessage =
    apiErrorMessage(receiveMutation.error, "No se pudo procesar la recepción.") ||
    apiErrorMessage(sendMutation.error, "No se pudo enviar la orden.");

  return (
    <Card className="flex flex-col" frame>
      {header}

      {order.notes ? (
        <p className="border-b border-divider px-4 py-2.5 text-sm text-ink-2">{order.notes}</p>
      ) : null}

      <div className="p-2">
        <Table>
          <caption className="sr-only">Partidas de la orden {order.folio}</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Producto</th>
              <th className={cn(tableHeadClass, tableNumClass)}>Pedido</th>
              <th className={cn(tableHeadClass, tableNumClass)}>Recibido</th>
              <th className={cn(tableHeadClass, tableNumClass)}>Costo u.</th>
              {receivable ? <th className={cn(tableHeadClass, tableNumClass)}>Recibir</th> : null}
              <th className={cn(tableHeadClass, tableNumClass)}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const ordered = Number(item.quantity);
              const got = Number(item.received_quantity);
              const pending = pendingOf(item);
              return (
                <tr className={tableRowClass} key={item.id}>
                  <td className={tableCellClass}>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="font-mono text-xs text-ink-2">{item.product_sku}</div>
                  </td>
                  <td className={cn(tableCellClass, tableNumClass)}>{formatStock(item.quantity)}</td>
                  <td
                    className={cn(
                      tableCellClass,
                      tableNumClass,
                      got >= ordered ? "text-ok" : got > 0 ? "text-warn" : "text-ink-2",
                    )}
                  >
                    {formatStock(item.received_quantity)}
                  </td>
                  <td className={cn(tableCellClass, tableNumClass)}>{formatCurrency(item.unit_cost)}</td>
                  {receivable ? (
                    <td className={cn(tableCellClass, tableNumClass)}>
                      {pending <= 0 ? (
                        <span className="text-xs text-ink-2">Completo</span>
                      ) : canRegisterReceipt ? (
                        <input
                          aria-label={`Recibir ${item.product_name}`}
                          className={cellInputClass}
                          max={pending}
                          min="0"
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={formatStock(pending)}
                          step="any"
                          type="number"
                          value={quantities[item.id] ?? ""}
                        />
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className={cn(tableCellClass, tableNumClass, "font-medium")}>{formatCurrency(item.subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <dl className="grid gap-1 border-t border-divider px-4 py-3 text-sm">
        <div className="flex justify-between text-ink-2">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-ink-2">
          <dt>IVA</dt>
          <dd className="tabular-nums">{formatCurrency(order.tax_total)}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="font-heading text-lg font-semibold">Total</dt>
          <dd className="font-heading text-3xl font-semibold tabular-nums">{formatCurrency(order.total)}</dd>
        </div>
      </dl>

      {errorMessage ? (
        <div className="mx-4 mb-3 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {received ? (
        <p className="mx-4 mb-3 flex items-center gap-1.5 text-sm text-ok" role="status">
          <CircleCheck aria-hidden="true" size={16} />
          Recepción registrada. El inventario se actualizó.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {canRegisterReceipt ? (
          <>
            <Button
              className="flex-1"
              disabled={!hasAnyQuantity || receiveMutation.isPending}
              icon={<PackageCheck aria-hidden="true" size={16} />}
              onClick={handleReceive}
            >
              {receiveMutation.isPending ? "Procesando..." : "Registrar recepción"}
            </Button>
            <Button onClick={fillPending} variant="secondary">
              Recibir todo
            </Button>
          </>
        ) : null}
        {canSend ? (
          <Button
            className="flex-1"
            disabled={sendMutation.isPending}
            icon={<Send aria-hidden="true" size={16} />}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? "Enviando..." : "Enviar al proveedor"}
          </Button>
        ) : null}
        <Button icon={<Printer aria-hidden="true" size={16} />} onClick={() => setPrinting(true)} variant="secondary">
          Imprimir
        </Button>
        {canCancel ? (
          <Button
            icon={<Ban aria-hidden="true" size={16} />}
            onClick={() => onRequestCancel(order.id)}
            variant="ghost"
          >
            Cancelar orden
          </Button>
        ) : null}
        {canClose ? (
          <Button
            icon={<PackageX aria-hidden="true" size={16} />}
            onClick={() => {
              closeMutation.reset();
              setConfirmingClose(true);
            }}
            variant="ghost"
          >
            Cerrar orden
          </Button>
        ) : null}
      </div>

      {confirmingClose ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmingClose(false)} variant="secondary">
                Volver
              </Button>
              <Button disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()} variant="danger">
                {closeMutation.isPending ? "Cerrando..." : "Cerrar orden"}
              </Button>
            </>
          }
          onClose={() => setConfirmingClose(false)}
          open
          title={`Cerrar la orden ${order.folio}`}
        >
          <div className="grid gap-3 text-sm text-ink-2">
            <p>
              La orden se da por terminada sin esperar lo pendiente. Lo ya recibido se queda en el inventario: una
              orden con mercancía recibida no se cancela porque esa entrada no se revierte.
            </p>
            <ul className="list-disc pl-5">
              {order.items
                .filter((item) => pendingOf(item) > 0)
                .map((item) => (
                  <li key={item.id}>
                    {formatStock(pendingOf(item))} pendientes de {item.product_name}
                  </li>
                ))}
            </ul>
            <Input label="Motivo (opcional)" maxLength={500} onChange={(e) => setCloseNotes(e.target.value)} value={closeNotes} />
            {closeMutation.error ? (
              <div className="border border-bad bg-bad-tint px-3 py-2 font-medium text-bad" role="alert">
                {apiErrorMessage(closeMutation.error, "No se pudo cerrar la orden.")}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {printing ? <PrintOrder onDone={() => setPrinting(false)} order={order} /> : null}
    </Card>
  );
}
