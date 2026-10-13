import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { ReceiveItemInput } from "../../api/purchases";
import { getOrder, receiveOrder } from "../../api/purchases";
import { Badge, Button, Modal, Table, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { qk } from "../../api/query-keys";

export function ReceiveOrderModal({
  orderId,
  onClose,
  onSuccess,
}: {
  orderId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const orderQuery = useQuery({
    queryKey: qk.purchaseOrderDetail(orderId),
    queryFn: () => getOrder(orderId),
  });

  const [quantities, setQuantities] = useState<Record<number, string>>({});

  const order = orderQuery.data;

  const receiveMutation = useMutation({
    mutationFn: (items: ReceiveItemInput[]) => receiveOrder(orderId, items),
    onSuccess,
  });

  function handleReceive() {
    if (!order) return;
    const items: ReceiveItemInput[] = [];
    for (const item of order.items) {
      const qty = quantities[item.id];
      if (qty && Number(qty) > 0) {
        items.push({ order_item_id: item.id, received_quantity: qty });
      }
    }
    if (items.length === 0) return;
    receiveMutation.mutate(items);
  }

  const errorMessage = receiveMutation.error
    ? receiveMutation.error instanceof AxiosError
      ? receiveMutation.error.response?.data?.error ?? "No se pudo procesar la recepción."
      : "No se pudo procesar la recepción."
    : "";

  const hasAnyQuantity = Object.values(quantities).some((q) => Number(q) > 0);

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
          <Button
            disabled={!hasAnyQuantity || receiveMutation.isPending}
            onClick={handleReceive}
          >
            {receiveMutation.isPending ? "Procesando..." : "Confirmar Recepción"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={order ? `Recibir ${order.folio}` : "Cargando..."}
    >
      {orderQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-ink-2">Cargando orden...</p>
      ) : !order ? (
        <p className="py-6 text-center text-sm text-bad">No se encontró la orden.</p>
      ) : (
        <div className="grid gap-4">
          <div className="text-sm text-ink-2">
            Proveedor: <span className="font-medium text-text">{order.supplier_name}</span>
          </div>

          <div className="max-h-64 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de recepcion de orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Pedido</th>
                  <th className={`${tableHeadClass} text-right`}>Recibido</th>
                  <th className={`${tableHeadClass} text-right`}>Pendiente</th>
                  <th className={`${tableHeadClass} text-right`}>Recibir</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const ordered = Number(item.quantity);
                  const received = Number(item.received_quantity);
                  const pending = Math.max(0, ordered - received);
                  const fullyReceived = pending <= 0;

                  return (
                    <tr className={`${tableRowClass} ${fullyReceived ? "opacity-50" : ""}`} key={item.id}>
                      <td className={tableCellClass}>
                        <div className="text-sm font-medium">{item.product_name}</div>
                        <div className="font-mono text-xs text-ink-2">{item.product_sku}</div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.received_quantity}</td>
                      <td className={`${tableCellClass} text-right font-mono`}>
                        <Badge tone={fullyReceived ? "success" : "warning"}>{pending.toFixed(3)}</Badge>
                      </td>
                      <td className={tableCellClass}>
                        {fullyReceived ? (
                          <span className="text-xs text-ink-2">Completo</span>
                        ) : (
                          <input
                            className="w-20 border border-divider bg-bg px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                            max={pending}
                            min="0"
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="0"
                            step="any"
                            type="number"
                            value={quantities[item.id] ?? ""}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {errorMessage ? (
            <div className="border border-bad/30 bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{errorMessage}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
