import { useQuery } from "@tanstack/react-query";
import type { PurchaseOrder } from "../../api/purchases";
import { getOrder } from "../../api/purchases";
import { Badge, Modal, Table, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { qk } from "../../api/query-keys";
import { statusLabel, statusTone } from "./helpers";

export function OrderDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const orderQuery = useQuery({
    queryKey: qk.purchaseOrderDetail(orderId),
    queryFn: () => getOrder(orderId),
  });

  const order: PurchaseOrder | undefined = orderQuery.data;

  return (
    <Modal onClose={onClose} open title={order ? `Orden ${order.folio}` : "Cargando..."}>
      {orderQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-ink-2">Cargando detalle...</p>
      ) : !order ? (
        <p className="py-6 text-center text-sm text-bad">No se encontró la orden.</p>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-ink-2">Proveedor: </span>
              <span className="font-medium">{order.supplier_name}</span>
            </div>
            <div>
              <span className="text-ink-2">Estado: </span>
              <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
            </div>
            <div>
              <span className="text-ink-2">Creada por: </span>
              <span className="font-medium">{order.username}</span>
            </div>
            <div>
              <span className="text-ink-2">Fecha: </span>
              <span className="font-medium">
                {new Date(order.created_at).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {order.notes ? (
            <div className="border border-divider bg-bg px-3 py-2 text-sm text-ink-2">
              {order.notes}
            </div>
          ) : null}

          <div className="max-h-64 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de items de la orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Pedido</th>
                  <th className={`${tableHeadClass} text-right`}>Recibido</th>
                  <th className={`${tableHeadClass} text-right`}>Costo u.</th>
                  <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const received = Number(item.received_quantity);
                  const ordered = Number(item.quantity);
                  return (
                    <tr className={tableRowClass} key={item.id}>
                      <td className={tableCellClass}>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="font-mono text-xs text-ink-2">{item.product_sku}</div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                      <td className={tableCellClass}>
                        <div className="flex justify-end">
                          <Badge tone={received >= ordered ? "success" : received > 0 ? "warning" : "neutral"}>
                            {item.received_quantity}
                          </Badge>
                        </div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>${item.unit_cost}</td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${item.subtotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <div className="bg-text px-4 py-3 text-white">
            <div className="flex justify-between">
              <span className="text-lg font-bold">Total</span>
              <span className="font-mono text-xl font-bold">${order.total}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
