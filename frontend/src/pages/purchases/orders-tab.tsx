import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";

import type { PurchaseOrderListItem } from "../../api/purchases";
import { cancelOrder, listOrders } from "../../api/purchases";
import { qk } from "../../api/query-keys";
import { useCan } from "../../components/auth/require-permission";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, Pagination, Segmented, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatCurrency } from "../../lib/formatters";
import { CreateOrderModal } from "./create-order-modal";
import { apiErrorMessage, formatShortDate, STATUS_LABELS, statusLabel, statusTone } from "./helpers";
import { OrderPanel } from "./order-panel";

const statusOptions = [
  { label: "Todas", value: "" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value })),
];

type OrdersTabProps = {
  /** El botón "Nueva orden" vive en el encabezado de la página. */
  onCloseCreate: () => void;
  onRequestCreate: () => void;
  showCreate: boolean;
};

/** Órdenes de compra: filtro por estado, lista y detalle de la orden seleccionada. */
export function OrdersTab({ onCloseCreate, onRequestCreate, showCreate }: OrdersTabProps) {
  const queryClient = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<number | null>(null);

  const ordersQuery = useQuery({
    queryKey: qk.purchaseOrders(page, statusFilter),
    queryFn: () => listOrders({ page, status: statusFilter }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() }),
        queryClient.invalidateQueries({ queryKey: qk.purchaseOrderDetail() }),
        queryClient.invalidateQueries({ queryKey: qk.sidebarPendingPurchases() }),
      ]);
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const totalPages = ordersQuery.data?.pages ?? 1;
  // Si no hay selección (o la orden ya no está en la página), se muestra la primera
  const selected = orders.find((o) => o.id === selectedId) ?? orders[0];

  return (
    <div className="grid gap-4">
      <div className="max-w-full overflow-x-auto">
        <Segmented
          aria-label="Filtrar por estado"
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
            setSelectedId(null);
          }}
          options={statusOptions}
          size="sm"
          value={statusFilter}
        />
      </div>

      {ordersQuery.isLoading ? (
        <SkeletonTable cols={6} rows={6} />
      ) : ordersQuery.isError ? (
        <ErrorState message="No se pudieron cargar las órdenes de compra." onRetry={() => void ordersQuery.refetch()} />
      ) : orders.length === 0 ? (
        <EmptyState
          actionLabel={can("compras:crear") ? "Nueva orden" : undefined}
          icon={<Truck size={32} />}
          message={statusFilter ? "No hay órdenes con este estado." : "Aún no hay órdenes de compra."}
          onAction={onRequestCreate}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
          <div className="grid min-w-0 gap-3">
            <Card frame>
              <div className="p-2">
                <Table>
                  <caption className="sr-only">Tabla de órdenes de compra</caption>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>Folio</th>
                      <th className={tableHeadClass}>Proveedor</th>
                      <th className={tableHeadClass}>Creada</th>
                      <th className={tableHeadClass}>Esperada</th>
                      <th className={cn(tableHeadClass, tableNumClass)}>Total</th>
                      <th className={tableHeadClass}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order: PurchaseOrderListItem) => {
                      const active = order.id === selected?.id;
                      return (
                        <tr
                          aria-selected={active}
                          className={cn(
                            tableRowClass,
                            "cursor-pointer",
                            active && "bg-acc-tint shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-acc-tint",
                          )}
                          key={order.id}
                          onClick={() => setSelectedId(order.id)}
                        >
                          <td className={cn(tableCellClass, "whitespace-nowrap")}>
                            <button
                              aria-label={`Ver orden ${order.folio}`}
                              className="min-h-11 font-mono text-sm font-semibold text-acc-text hover:underline lg:min-h-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(order.id);
                              }}
                              type="button"
                            >
                              {order.folio}
                            </button>
                          </td>
                          <td className={tableCellClass}>
                            <div className="flex items-center gap-2">
                              <Avatar name={order.supplier_name} size="sm" />
                              <span className="font-medium">{order.supplier_name}</span>
                            </div>
                          </td>
                          <td className={cn(tableCellClass, "whitespace-nowrap text-ink-2")}>{formatShortDate(order.created_at)}</td>
                          <td className={cn(tableCellClass, "whitespace-nowrap text-ink-2")}>
                            {formatShortDate(order.expected_date, false)}
                          </td>
                          <td className={cn(tableCellClass, tableNumClass, "font-medium")}>{formatCurrency(order.total)}</td>
                          <td className={tableCellClass}>
                            <Badge dot tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
              <span>Página {ordersQuery.data?.page ?? page} de {totalPages}</span>
              <Pagination
                onPageChange={(p) => {
                  setPage(p);
                  setSelectedId(null);
                }}
                page={page}
                totalPages={totalPages}
              />
            </div>
          </div>

          {selected ? (
            <div className="min-w-0 lg:sticky lg:top-5">
              <OrderPanel key={selected.id} onRequestCancel={(id) => {
                  cancelMutation.reset();
                  setConfirmCancelOrderId(id);
                }} orderId={selected.id} />
            </div>
          ) : null}
        </div>
      )}

      {showCreate ? (
        <CreateOrderModal
          onClose={onCloseCreate}
          onSuccess={async () => {
            onCloseCreate();
            await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
            await queryClient.invalidateQueries({ queryKey: qk.sidebarPendingPurchases() });
          }}
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
          {cancelMutation.error ? (
            <div className="mt-3 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {apiErrorMessage(cancelMutation.error, "No se pudo cancelar la orden.")}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
