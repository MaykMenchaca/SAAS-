import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Check, Minus, Plus, Undo2 } from "lucide-react";

import type { RefundMethod, ReturnItemInput, SaleItem, SaleReturn } from "../../api/sales";
import { getActiveSession, getSale, returnSale, saleStatusMeta } from "../../api/sales";
import { invalidateAfterSale } from "../../api/invalidate";
import { qk } from "../../api/query-keys";
import { Badge, Button, Card, ErrorState, Segmented, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatCurrency } from "../../lib/formatters";
import { estimateLineCents, parseQty, qtyError, qtyText } from "./refund";
import { REFUND_METHOD_LABEL } from "./receipt";

type Line = {
  sale_item_id: number;
  maxQty: number;
  quantity: string;
  selected: boolean;
  allowsFractions: boolean;
};

const fieldClass =
  "min-h-20 w-full border border-field-border bg-surface px-3 py-2 text-base text-text transition-colors placeholder:text-ink-2 hover:border-text focus-visible:border-accent focus-visible:outline-offset-0";

const dateFmt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

/** Paso 2: artículos de la venta, cantidades según la unidad y panel de reembolso. */
export function ReturnWorkspace({
  onBack,
  onDone,
  saleId,
}: {
  onBack: () => void;
  onDone: (result: SaleReturn) => void;
  saleId: number;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [refundMethod, setRefundMethod] = useState<RefundMethod | null>(null);
  const [restock, setRestock] = useState(true);

  // Caja abierta del usuario: el reembolso en efectivo sale de su cajón y debe descontarse en su corte
  const activeSessionQuery = useQuery({ queryKey: qk.activePosSession("mia"), queryFn: getActiveSession });
  const activeSession = activeSessionQuery.data?.session ?? null;

  const saleQuery = useQuery({
    queryKey: qk.saleDetail(saleId),
    queryFn: () => getSale(saleId),
    refetchOnMount: "always",
  });
  const sale = saleQuery.data;
  const originalMethod = (sale?.payments?.[0]?.method ?? "efectivo") as RefundMethod;
  const effectiveMethod: RefundMethod = refundMethod ?? originalMethod;

  useEffect(() => {
    if (!sale?.items?.length) return;
    setLines(
      sale.items.map((item: SaleItem) => {
        const avail =
          item.available_quantity !== undefined
            ? Math.max(0, Number(item.available_quantity))
            : Math.max(0, Number(item.quantity) - Number(item.returned_quantity ?? "0"));
        const allowsFractions = Boolean(item.allows_fractions);
        return {
          sale_item_id: item.id,
          maxQty: avail,
          quantity: avail > 0 ? qtyText(allowsFractions ? avail : Math.floor(avail)) : "0",
          selected: false,
          allowsFractions,
        };
      }),
    );
  }, [sale]);

  const mutation = useMutation({
    mutationFn: (data: { reason: string; items: ReturnItemInput[] }) =>
      returnSale(saleId, data.reason, data.items, {
        sessionId: activeSession?.id ?? null,
        refundMethod: effectiveMethod,
        restock,
      }),
    onSuccess: async (result) => {
      await invalidateAfterSale(queryClient);
      onDone(result);
    },
  });

  function patch(id: number, change: Partial<Line> | ((l: Line) => Partial<Line>)) {
    setLines((prev) =>
      prev.map((l) => (l.sale_item_id === id ? { ...l, ...(typeof change === "function" ? change(l) : change) } : l)),
    );
  }

  function toggle(id: number) {
    patch(id, (l) => {
      if (l.selected) return { selected: false };
      const full = qtyText(l.allowsFractions ? l.maxQty : Math.floor(l.maxQty));
      return { selected: true, quantity: parseQty(l.quantity) > 0 ? l.quantity : full };
    });
  }

  function step(id: number, delta: number) {
    patch(id, (l) => {
      const base = Number.isNaN(parseQty(l.quantity)) ? 0 : parseQty(l.quantity);
      const next = Math.min(l.maxQty, Math.max(0, base + delta));
      return { quantity: qtyText(next), selected: next > 0 };
    });
  }

  const itemsById = useMemo(() => new Map((sale?.items ?? []).map((i: SaleItem) => [i.id, i])), [sale]);
  const chosen = lines.filter((l) => l.selected);
  const invalid = chosen.some((l) => qtyError(l.quantity, l.maxQty, l.allowsFractions) !== "");

  let subCents = 0;
  let taxCents = 0;
  for (const l of chosen) {
    const item = itemsById.get(l.sale_item_id);
    if (!item || qtyError(l.quantity, l.maxQty, l.allowsFractions)) continue;
    const e = estimateLineCents(item, parseQty(l.quantity));
    subCents += e.subCents;
    taxCents += e.taxCents;
  }

  const needsCash = effectiveMethod === "efectivo" && !activeSession;
  const canConfirm = chosen.length > 0 && !invalid && reason.trim() !== "" && !mutation.isPending && !needsCash;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm) return;
    mutation.mutate({
      reason: reason.trim(),
      items: chosen.map((l) => ({ sale_item_id: l.sale_item_id, quantity: l.quantity })),
    });
  }

  const errorText = mutation.error
    ? mutation.error instanceof AxiosError
      ? (mutation.error.response?.data?.error ?? "No se pudo procesar la devolución.")
      : "No se pudo procesar la devolución."
    : "";

  if (saleQuery.isLoading) {
    return (
      <div className="grid gap-4" role="status">
        <span className="sr-only">Cargando venta…</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (saleQuery.isError || !sale) {
    return (
      <div className="grid gap-3">
        <ErrorState message="No se encontró la venta." onRetry={() => void saleQuery.refetch()} />
        <div className="flex justify-center">
          <Button onClick={onBack} variant="secondary">Cambiar venta</Button>
        </div>
      </div>
    );
  }
  if (sale.status === "cancelada" || sale.status === "devolucion_total") {
    return (
      <div className="grid gap-3">
        <p className="border border-bad bg-bad-tint px-4 py-3 font-medium text-bad" role="alert">
          {sale.status === "cancelada"
            ? "Esta venta está cancelada y no admite devoluciones."
            : "Esta venta ya fue devuelta por completo."}
        </p>
        <div>
          <Button onClick={onBack} variant="secondary">Cambiar venta</Button>
        </div>
      </div>
    );
  }

  const status = saleStatusMeta(sale.status);

  return (
    <form className="flex flex-wrap items-start gap-6" onSubmit={handleSubmit}>
      <Card className="min-w-0 flex-1 basis-[34rem]" frame>
        <header className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl tabular-nums">{sale.folio}</h2>
            <p className="text-sm text-ink-2">
              {new Date(sale.created_at).toLocaleString("es-MX", dateFmt)} · {sale.username} · Pagada en{" "}
              {(sale.payments ?? []).map((p) => p.method).join(" + ") || "—"} · Total {formatCurrency(sale.total)}
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Button onClick={onBack} variant="ghost">Cambiar venta</Button>
        </header>

        <ul>
          {lines.map((line) => {
            const item = itemsById.get(line.sale_item_id);
            if (!item) return null;
            const fullyReturned = line.maxQty <= 0;
            const error = line.selected ? qtyError(line.quantity, line.maxQty, line.allowsFractions) : "";
            const lineTotal = line.selected && !error ? estimateLineCents(item, parseQty(line.quantity)).totalCents : 0;
            return (
              <li
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-4 py-3 sm:px-5",
                  line.selected && "bg-acc-tint",
                )}
                key={item.id}
              >
                <button
                  aria-checked={line.selected}
                  aria-label={`Incluir ${item.product_name} en la devolución`}
                  className={cn("grid h-11 w-11 shrink-0 place-items-center", fullyReturned && "cursor-not-allowed opacity-45")}
                  disabled={fullyReturned}
                  onClick={() => toggle(item.id)}
                  role="checkbox"
                  type="button"
                >
                  <span
                    className={cn(
                      "grid h-[22px] w-[22px] place-items-center border",
                      line.selected ? "border-accent bg-accent text-on-acc" : "border-field-border",
                    )}
                  >
                    {line.selected ? <Check aria-hidden="true" size={14} strokeWidth={2} /> : null}
                  </span>
                </button>

                <div className="min-w-0 flex-1 basis-48">
                  <div className="font-medium">{item.product_name}</div>
                  <div className="text-sm tabular-nums text-ink-2">
                    {item.product_sku} · Vendidos {qtyText(Number(item.quantity))} × {formatCurrency(item.unit_price)}
                    {Number(item.returned_quantity ?? 0) > 0 ? ` · Devueltos ${qtyText(Number(item.returned_quantity))}` : ""}
                  </div>
                  {fullyReturned ? <div className="text-sm font-semibold text-bad">Completamente devuelto</div> : null}
                  {error ? (
                    <div className="text-sm font-medium text-bad" role="alert">{error}</div>
                  ) : null}
                </div>

                <div className={cn("flex items-center", !line.selected && "opacity-55")}>
                  <Button
                    aria-label={`Quitar una unidad de ${item.product_name}`}
                    className="w-11 px-0"
                    disabled={fullyReturned}
                    onClick={() => step(item.id, -1)}
                    variant="secondary"
                  >
                    <Minus aria-hidden="true" size={14} />
                  </Button>
                  <input
                    aria-label={`Cantidad a devolver de ${item.product_name}`}
                    className="min-h-11 w-20 border-y border-field-border bg-surface text-center font-medium tabular-nums text-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:opacity-45"
                    disabled={fullyReturned}
                    inputMode={line.allowsFractions ? "decimal" : "numeric"}
                    max={line.maxQty}
                    min={0}
                    onChange={(e) => patch(item.id, { quantity: e.target.value, selected: true })}
                    step={line.allowsFractions ? "0.001" : "1"}
                    type="number"
                    value={line.quantity}
                  />
                  <Button
                    aria-label={`Agregar una unidad de ${item.product_name}`}
                    className="w-11 px-0"
                    disabled={fullyReturned}
                    onClick={() => step(item.id, 1)}
                    variant="secondary"
                  >
                    <Plus aria-hidden="true" size={14} />
                  </Button>
                </div>
                <span className={cn("min-w-24 text-right font-medium tabular-nums", !line.selected && "text-ink-2")}>
                  {line.selected && !error ? formatCurrency(lineTotal / 100) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="grid flex-1 basis-80 gap-4 p-4 sm:p-5 lg:sticky lg:top-5 lg:max-w-md" frame>
        <h2 className="text-2xl">Reembolso</h2>

        <label className="grid gap-1.5 text-sm font-medium text-ink-2">
          <span>Motivo</span>
          <textarea
            className={fieldClass}
            name="reason"
            onChange={(e) => setReason(e.target.value)}
            placeholder="Producto defectuoso, error en cantidad..."
            value={reason}
          />
        </label>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-ink-2">Regresar dinero en</span>
          <Segmented
            aria-label="Regresar dinero en"
            fullWidth
            onChange={(v) => setRefundMethod(v)}
            options={(Object.keys(REFUND_METHOD_LABEL) as RefundMethod[]).map((m) => ({
              label: REFUND_METHOD_LABEL[m],
              value: m,
            }))}
            value={effectiveMethod}
          />
          <span className="text-sm text-ink-2">Método de pago original: {REFUND_METHOD_LABEL[originalMethod]}.</span>
          {effectiveMethod === "efectivo" ? (
            activeSession ? (
              <span className="text-sm text-ink-2">
                El reembolso se descontará del corte de {activeSession.cash_register_name ?? "tu caja"}.
              </span>
            ) : (
              <p className="border border-warn bg-warn-tint px-3 py-2 text-sm font-medium text-warn" role="alert">
                No tienes una caja abierta. Para reembolsar en efectivo, abre tu caja o elige otro método.
              </p>
            )
          ) : null}
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-base">
          <input
            checked={restock}
            className="h-4 w-4 accent-accent"
            name="restock"
            onChange={(e) => setRestock(e.target.checked)}
            type="checkbox"
          />
          Regresar artículos al inventario
        </label>
        {!restock ? (
          <p className="-mt-2 text-sm text-ink-2">
            Los artículos no sumarán al inventario (producto dañado). El reembolso no cambia.
          </p>
        ) : null}

        <div className="grid gap-1 border-t border-divider pt-3">
          <div className="flex justify-between text-ink-2">
            <span>
              {chosen.length} {chosen.length === 1 ? "artículo" : "artículos"}
            </span>
            <span className="tabular-nums">{formatCurrency(subCents / 100)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>IVA</span>
            <span className="tabular-nums">{formatCurrency(taxCents / 100)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-lg font-semibold">A devolver (estimado)</span>
            <span className="font-heading text-4xl font-semibold tabular-nums">
              {formatCurrency((subCents + taxCents) / 100)}
            </span>
          </div>
          <span className="text-sm text-ink-2">El importe final lo calcula el servidor al registrar.</span>
        </div>

        {errorText ? (
          <p className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
            {errorText}
          </p>
        ) : null}

        <Button disabled={!canConfirm} frame icon={<Undo2 aria-hidden="true" size={17} />} size="lg" type="submit">
          {mutation.isPending ? "Procesando..." : "Registrar devolución"}
        </Button>
        {chosen.length === 0 || !reason.trim() ? (
          <p className="text-sm text-ink-2">Selecciona al menos un artículo y escribe el motivo.</p>
        ) : null}
      </Card>
    </form>
  );
}
