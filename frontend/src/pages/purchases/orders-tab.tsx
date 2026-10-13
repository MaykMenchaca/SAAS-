import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, PackageCheck, Plus, Send, Truck } from "lucide-react";

import type { PurchaseOrderListItem } from "../../api/purchases";
import { cancelOrder, listOrders, sendOrder } from "../../api/purchases";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, Pagination, Select, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { qk } from "../../api/query-keys";
import { invalidateAfterPurchase } from "../../api/invalidate";
import { statusLabel, statusTone } from "./helpers";
import { OrderDetailModal } from "./order-detail";
import { CreateOrderModal } from "./create-order-modal";
import { ReceiveOrderModal } from "./receive-order-modal";

export function OrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<number | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<number | null>(null);

  const ordersQuery = useQuery({
    queryKey: qk.purchaseOrders(page, statusFilter),
    queryFn: () => listOrders({ page, status: statusFilter }),
  });

  const sendMutation = useMutation({
    mutationFn: sendOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const totalPages = ordersQuery.data?.pages ?? 1;

  return (
    <div className="grid gap-3">
      {/* Filters + New order button */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Select
          label="Estado"
          name="status-filter"
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "borrador", label: "Borrador" },
            { value: "enviada", label: "Enviada" },
            { value: "parcial", label: "Parcial" },
            { value: "recibida", label: "Recibida" },
            { value: "cancelada", label: "Cancelada" },
          ]}
          placeholder="Todos"
          value={statusFilter}
        />
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowCreateOrder(true)}>
          Nueva Orden
        </Button>
      </div>

      {ordersQuery.isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : ordersQuery.isError ? (
        <ErrorState onRetry={() => void ordersQuery.refetch()} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Truck size={32} />}
          message="Sin ordenes de compra."
          actionLabel="Nueva orden"
          onAction={() => setShowCreateOrder(true)}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <caption className="sr-only">Tabla de ordenes de compra</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Folio</th>
                  <th className={tableHeadClass}>Proveedor</th>
                  <th className={tableHeadClass}>Fecha</th>
                  <th className={`${tableHeadClass} text-right`}>Total</th>
                  <th className={tableHeadClass}>Estado</th>
                  <th className={tableHeadClass}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: PurchaseOrderListItem) => (
                  <tr className={tableRowClass} key={order.id}>
                    <td className={tableCellClass}>
                      <span className="font-mono text-sm font-semibold text-acc-text">{order.folio}</span>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-2">
                        <Avatar name={order.supplier_name} size="sm" />
                        <span className="font-medium">{order.supplier_name}</span>
                      </div>
                    </td>
                    <td className={`${tableCellClass} text-sm text-ink-2`}>
                      {new Date(order.created_at).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {order.expected_date ? (
                        <div className="text-xs">
                          Espera: {new Date(order.expected_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} text-right font-mono font-semibold`}>${order.total}</td>
                    <td className={tableCellClass}>
                      <Badge dot tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex gap-1.5">
                        <Tooltip content="Ver detalle">
                          <Button
                            aria-label={`Ver orden ${order.folio}`}
                            className="h-11 w-11 px-0"
                            onClick={() => setSelectedOrderId(order.id)}
                            variant="secondary"
                          >
                            <Eye aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                        {order.status === "borrador" ? (
                          <Tooltip content="Enviar">
                            <Button
                              aria-label={`Enviar orden ${order.folio}`}
                              className="h-11 w-11 px-0"
                              disabled={sendMutation.isPending}
                              onClick={() => sendMutation.mutate(order.id)}
                              variant="primary"
                            >
                              <Send aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                        {order.status === "enviada" || order.status === "parcial" ? (
                          <Tooltip content="Recibir">
                            <Button
                              aria-label={`Recibir orden ${order.folio}`}
                              className="h-11 w-11 px-0"
                              onClick={() => setReceivingOrderId(order.id)}
                              variant="primary"
                            >
                              <PackageCheck aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                        {order.status === "borrador" || order.status === "enviada" ? (
                          <Tooltip content="Cancelar">
                            <Button
                              aria-label={`Cancelar orden ${order.folio}`}
                              className="h-11 w-11 px-0 hover:text-bad hover:bg-bad/10"
                              disabled={cancelMutation.isPending}
                              onClick={() => setConfirmCancelOrderId(order.id)}
                              variant="ghost"
                            >
                              <Ban aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
            <span>Página {ordersQuery.data?.page ?? page} de {totalPages}</span>
            <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
          </div>
        </>
      )}

      {selectedOrderId !== null ? (
        <OrderDetailModal onClose={() => setSelectedOrderId(null)} orderId={selectedOrderId} />
      ) : null}

      {showCreateOrder ? (
        <CreateOrderModal
          onClose={() => setShowCreateOrder(false)}
          onSuccess={async () => {
            setShowCreateOrder(false);
            await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
          }}
        />
      ) : null}

      {receivingOrderId !== null ? (
        <ReceiveOrderModal
          onClose={() => setReceivingOrderId(null)}
          onSuccess={async () => {
            setReceivingOrderId(null);
            await invalidateAfterPurchase(queryClient);
          }}
          orderId={receivingOrderId}
        />
      ) : null}

      {confirmCancelOrderId !== null ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmCancelOrderId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={cancelMutation.isPending}
                onClick={() => {
                  cancelMutation.mutate(confirmCancelOrderId, {
                    onSuccess: () => setConfirmCancelOrderId(null),
                  });
                }}
                variant="danger"
              >
                {cancelMutation.isPending ? "Cancelando..." : "Cancelar orden"}
              </Button>
            </>
          }
          onClose={() => setConfirmCancelOrderId(null)}
          open
          title="Cancelar orden de compra"
        >
          <p className="text-sm text-ink-2">
            ¿Confirmas que deseas cancelar esta orden de compra? Esta acción no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
