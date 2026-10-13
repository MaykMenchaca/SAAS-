import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Ban, CornerDownLeft, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { printResultMessage, printSaleTicket } from "../../api/printing";
import { cancelSale, getSale, saleStatusMeta } from "../../api/sales";
import { invalidateAfterSale } from "../../api/invalidate";
import { qk } from "../../api/query-keys";
import { useCan } from "../../components/auth/require-permission";
import { Badge, Button, Card, ErrorState, Skeleton } from "../../components/ui";
import { formatCurrency, formatQuantity } from "../../lib/formatters";

const dateFmt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

const PAYMENT_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };

/** Panel de ticket de la venta seleccionada: partidas, subtotal, IVA, total, pagos y acciones. */
export function SaleDetail({ saleId }: { saleId: number }) {
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const saleQuery = useQuery({ queryKey: qk.saleDetail(saleId), queryFn: () => getSale(saleId) });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSale(saleId, cancelReason.trim()),
    onSuccess: async () => {
      await invalidateAfterSale(queryClient);
      setShowCancel(false);
      setCancelReason("");
    },
  });

  const reprintMutation = useMutation({
    mutationFn: () => printSaleTicket(saleId),
    onSuccess: (result) => {
      const message = printResultMessage(result);
      if (message.tone === "warning") toast.warning(message.text);
      else toast.success(message.text);
    },
    onError: (error) => {
      toast.error(error instanceof AxiosError ? (error.response?.data?.error ?? "No se pudo imprimir.") : "No se pudo imprimir.");
    },
  });

  const sale = saleQuery.data;

  if (saleQuery.isLoading) {
    return (
      <Card className="grid gap-3 p-4" frame role="status">
        <span className="sr-only">Cargando detalle…</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (saleQuery.isError || !sale) {
    return (
      <Card frame>
        <ErrorState message="No se encontró la venta." onRetry={() => void saleQuery.refetch()} />
      </Card>
    );
  }

  const status = saleStatusMeta(sale.status);
  const canReturn = (sale.status === "completada" || sale.status === "devolucion_parcial") && can("ventas:cancelar");
  const canCancel = sale.status === "completada" && can("ventas:cancelar");

  function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancelReason.trim()) cancelMutation.mutate();
  }

  const cancelError = cancelMutation.error
    ? cancelMutation.error instanceof AxiosError
      ? (cancelMutation.error.response?.data?.error ?? "No se pudo cancelar.")
      : "No se pudo cancelar."
    : "";

  return (
    <Card className="flex flex-col" frame>
      <header className="flex items-start gap-3 border-b border-divider px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="font-heading text-sm font-semibold uppercase tracking-widest text-acc-text">Ticket</div>
          <h2 className="mt-0.5 text-2xl tabular-nums">{sale.folio}</h2>
          <div className="text-sm text-ink-2">
            {new Date(sale.created_at).toLocaleString("es-MX", dateFmt)} · {sale.username}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <ul className="py-1.5">
        {sale.items.map((item) => (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2 sm:px-5" key={item.id}>
            <span className="font-medium">{item.product_name}</span>
            <span className="text-right font-medium tabular-nums">{formatCurrency(item.subtotal)}</span>
            <span className="text-sm tabular-nums text-ink-2">
              {formatQuantity(item.quantity, { allows_fractions: item.allows_fractions })} × {formatCurrency(item.unit_price)} · {item.product_sku}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-1 border-t border-divider px-4 py-3 sm:px-5">
        <div className="flex justify-between text-ink-2">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
        </div>
        {Number(sale.discount_total) > 0 ? (
          <div className="flex justify-between text-ink-2">
            <span>Descuento</span>
            <span className="tabular-nums">-{formatCurrency(sale.discount_total)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-ink-2">
          <span>IVA</span>
          <span className="tabular-nums">{formatCurrency(sale.tax_total)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-lg font-semibold">Total</span>
          <span className="font-heading text-3xl font-semibold tabular-nums">{formatCurrency(sale.total)}</span>
        </div>
        {sale.payments.map((payment) => (
          <div className="flex justify-between text-sm text-ink-2" key={payment.id}>
            <span>
              Pago · {PAYMENT_LABEL[payment.method] ?? payment.method}
              {payment.reference ? ` (ref: ${payment.reference})` : ""}
            </span>
            <span className="tabular-nums">{formatCurrency(payment.amount)}</span>
          </div>
        ))}
      </div>

      {sale.cancel_reason ? (
        <p className="mx-4 mb-3.5 border border-bad bg-bad-tint px-3 py-2.5 text-sm text-bad sm:mx-5">
          <span className="font-semibold">Razón de cancelación: </span>
          {sale.cancel_reason}
        </p>
      ) : null}

      {showCancel ? (
        <form className="mx-4 mb-4 grid gap-2 border border-bad p-3 sm:mx-5" onSubmit={handleCancel}>
          <label className="grid gap-1.5 text-sm font-medium text-ink-2">
            <span>Motivo de cancelación</span>
            <input
              className="min-h-11 w-full border border-field-border bg-surface px-3 py-2 text-base text-text placeholder:text-ink-2 hover:border-text focus-visible:border-accent focus-visible:outline-offset-0"
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ingresa el motivo..."
              value={cancelReason}
            />
          </label>
          {cancelError ? (
            <p className="text-sm font-medium text-bad" role="alert">{cancelError}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setShowCancel(false)} variant="secondary">Volver</Button>
            <Button disabled={!cancelReason.trim() || cancelMutation.isPending} type="submit" variant="danger">
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </div>
        </form>
      ) : null}

      {!showCancel && sale.status !== "cancelada" ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
          <Button
            className="flex-1"
            disabled={reprintMutation.isPending}
            icon={<Printer aria-hidden="true" size={16} />}
            onClick={() => reprintMutation.mutate()}
            variant="secondary"
          >
            {reprintMutation.isPending ? "Enviando..." : "Reimprimir"}
          </Button>
          {canReturn ? (
            <Button
              className="flex-1"
              icon={<CornerDownLeft aria-hidden="true" size={16} />}
              onClick={() => navigate(`/devoluciones?venta=${sale.id}`)}
              variant="secondary"
            >
              Devolución
            </Button>
          ) : null}
          {canCancel ? (
            <Button className="text-bad" icon={<Ban aria-hidden="true" size={16} />} onClick={() => setShowCancel(true)} variant="ghost">
              Cancelar venta
            </Button>
          ) : null}
        </div>
      ) : null}
      {!showCancel && sale.status === "cancelada" ? (
        <div className="px-4 pb-4 sm:px-5">
          <Button
            disabled={reprintMutation.isPending}
            icon={<Printer aria-hidden="true" size={16} />}
            onClick={() => reprintMutation.mutate()}
            variant="secondary"
          >
            Reimprimir
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
