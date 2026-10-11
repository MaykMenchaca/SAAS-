import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Ban, Eye, FileText, Printer, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import type { SaleListItem } from "../api/sales";
import { printSaleTicket } from "../api/printing";
import { cancelSale, getSale, listSales } from "../api/sales";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pagination, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { qk } from "../api/query-keys";
import { invalidateAfterSale } from "../api/invalidate";

// ── Main Page ──────────────────────────────────────────────────────

export function SalesHistoryPage() {
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  const salesQuery = useQuery({
    queryKey: qk.salesHistory(page),
    queryFn: () => listSales(page, 20),
  });

  const sales = salesQuery.data?.items ?? [];
  const totalPages = salesQuery.data?.pages ?? 1;

  function statusTone(status: string): "success" | "danger" | "neutral" {
    if (status === "completada") return "success";
    if (status === "cancelada") return "danger";
    return "neutral";
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Historial de Ventas"
        subtitle="Todas las transacciones registradas y reimpresión de tickets"
      />

      <section className="grid gap-3">
        {salesQuery.isLoading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : salesQuery.isError ? (
          <ErrorState onRetry={() => void salesQuery.refetch()} />
        ) : sales.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={32} />}
            message="Sin ventas registradas."
            actionLabel="Ir al POS"
            actionHref="/pos"
          />
        ) : (
          <>
            <Card className="overflow-hidden">
              <Table>
                <caption className="sr-only">Tabla de ventas</caption>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Folio</th>
                    <th className={tableHeadClass}>Fecha</th>
                    <th className={tableHeadClass}>Cajero</th>
                    <th className={`${tableHeadClass} text-right`}>Total</th>
                    <th className={tableHeadClass}>Estado</th>
                    <th className={tableHeadClass}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale: SaleListItem) => (
                    <tr className={tableRowClass} key={sale.id}>
                      <td className={tableCellClass}>
                        <span className="font-mono text-sm font-semibold text-primary-text">{sale.folio}</span>
                      </td>
                      <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                        {new Date(sale.created_at).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className={tableCellClass}>
                        <div className="flex items-center gap-2">
                          <Avatar name={sale.username} size="sm" />
                          <span>{sale.username}</span>
                        </div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${sale.total}</td>
                      <td className={tableCellClass}>
                        <Badge dot tone={statusTone(sale.status)}>
                          {sale.status === "completada" ? "Completada" : "Cancelada"}
                        </Badge>
                      </td>
                      <td className={tableCellClass}>
                        <Tooltip content="Ver detalle">
                          <Button
                            aria-label={`Ver venta ${sale.folio}`}
                            className="h-11 w-11 px-0"
                            onClick={() => setSelectedSaleId(sale.id)}
                            variant="secondary"
                          >
                            <Eye aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
              <span>Página {salesQuery.data?.page ?? page} de {totalPages}</span>
              <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
            </div>
          </>
        )}
      </section>

      {selectedSaleId !== null ? (
        <SaleDetailModal onClose={() => setSelectedSaleId(null)} saleId={selectedSaleId} />
      ) : null}
    </div>
  );
}

// ── Sale Detail Modal ─────────────────────────────────────────────

function SaleDetailModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const saleQuery = useQuery({
    queryKey: qk.saleDetail(saleId),
    queryFn: () => getSale(saleId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSale(saleId, cancelReason),
    onSuccess: async () => {
      await invalidateAfterSale(queryClient);
      setShowCancel(false);
    },
  });

  const reprintMutation = useMutation({
    mutationFn: () => printSaleTicket(saleId),
    onSuccess: () => toast.success("Ticket enviado a la impresora."),
    onError: (error) => {
      const message =
        error instanceof AxiosError ? error.response?.data?.error ?? "No se pudo imprimir." : "No se pudo imprimir.";
      toast.error(message);
    },
  });

  const sale = saleQuery.data;

  function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancelReason.trim()) {
      cancelMutation.mutate();
    }
  }

  const cancelError = cancelMutation.error
    ? cancelMutation.error instanceof AxiosError
      ? cancelMutation.error.response?.data?.error ?? "No se pudo cancelar."
      : "No se pudo cancelar."
    : "";

  return (
    <Modal onClose={onClose} open title={sale ? `Venta ${sale.folio}` : "Cargando..."}>
      {saleQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando detalle...</p>
      ) : !sale ? (
        <p className="py-6 text-center text-sm text-danger">No se encontró la venta.</p>
      ) : (
        <div className="grid gap-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-neutral-text-secondary">Cajero: </span>
              <span className="font-medium">{sale.username}</span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Estado: </span>
              <Badge tone={sale.status === "completada" ? "success" : "danger"}>
                {sale.status === "completada" ? "Completada" : "Cancelada"}
              </Badge>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Fecha: </span>
              <span className="font-medium">
                {new Date(sale.created_at).toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Folio: </span>
              <span className="font-mono font-semibold text-primary-text">{sale.folio}</span>
            </div>
          </div>

          {sale.cancel_reason ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <span className="font-semibold">Razón de cancelación: </span>
              {sale.cancel_reason}
            </div>
          ) : null}

          {/* Items */}
          <div className="max-h-64 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de items de la venta</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Cant.</th>
                  <th className={`${tableHeadClass} text-right`}>Precio</th>
                  <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr className={tableRowClass} key={item.id}>
                    <td className={tableCellClass}>
                      <div className="font-medium">{item.product_name}</div>
                      <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                    </td>
                    <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                    <td className={`${tableCellClass} text-right font-mono`}>${item.unit_price}</td>
                    <td className={`${tableCellClass} text-right font-mono font-semibold`}>${item.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* Totals */}
          <div className="rounded-md bg-pos-total-bg px-4 py-3 text-pos-total-text fade-in">
            <div className="flex justify-between text-sm">
              <span className="opacity-75">Subtotal</span>
              <span className="font-mono">${sale.subtotal}</span>
            </div>
            {Number(sale.discount_total) > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="opacity-75">Descuento</span>
                <span className="font-mono text-warning">-${sale.discount_total}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm">
              <span className="opacity-75">Impuestos</span>
              <span className="font-mono">${sale.tax_total}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-white/10 pt-2">
              <span className="text-lg font-bold">Total</span>
              <span className="font-mono text-xl font-bold">${sale.total}</span>
            </div>
          </div>

          {/* Payments */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-text-secondary">Pagos</p>
            <div className="grid gap-1.5">
              {sale.payments.map((payment) => (
                <div className="flex items-center justify-between rounded-md border border-neutral-border px-3 py-2 text-sm" key={payment.id}>
                  <div className="flex items-center gap-2">
                    <FileText aria-hidden="true" className="text-neutral-text-secondary" size={15} />
                    <span className="capitalize">{payment.method}</span>
                    {payment.reference ? (
                      <span className="font-mono text-xs text-neutral-text-secondary">ref: {payment.reference}</span>
                    ) : null}
                  </div>
                  <span className="font-mono font-semibold">${payment.amount}</span>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            disabled={reprintMutation.isPending}
            icon={<Printer aria-hidden="true" size={17} />}
            onClick={() => reprintMutation.mutate()}
            variant="secondary"
          >
            {reprintMutation.isPending ? "Enviando..." : "Reimprimir ticket"}
          </Button>

          {/* Cancel action */}
          {sale.status === "completada" && !showCancel ? (
            <Button
              className="w-full"
              icon={<Ban aria-hidden="true" size={17} />}
              onClick={() => setShowCancel(true)}
              variant="danger"
            >
              Cancelar venta
            </Button>
          ) : null}

          {showCancel ? (
            <form className="grid gap-3 rounded-md border border-danger/30 bg-danger/10 p-3" onSubmit={handleCancel}>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
                <span>Razón de cancelación</span>
                <textarea
                  className="min-h-16 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ingresa el motivo..."
                  value={cancelReason}
                />
              </label>
              {cancelError ? (
                <div className="text-sm font-medium text-danger">{cancelError}</div>
              ) : null}
              <div className="flex gap-2">
                <Button onClick={() => setShowCancel(false)} variant="secondary">
                  Cerrar
                </Button>
                <Button disabled={!cancelReason.trim() || cancelMutation.isPending} type="submit" variant="danger">
                  {cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelación"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
