import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Delete, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { invalidateAfterSale } from "../../api/invalidate";
import type { CreateSalePayload, PaymentInput, Sale, SaleItemInput } from "../../api/sales";
import { createSale, quoteSale } from "../../api/sales";
import { Button, Input, Modal, Segmented } from "../../components/ui";
import { cn } from "../../lib/cn";
import { isServerUnavailable } from "../../lib/connectivity";
import { formatCurrency } from "../../lib/formatters";
import { useAuthStore } from "../../stores/auth-store";
import { useConnectionStore } from "../../stores/connection-store";
import { getCartTotals, usePosStore } from "../../stores/pos-store";
import type { PaymentEntry, PayMethod } from "./payment-math";
import { applyKeypad, KEYPAD_KEYS, paymentStatus, quickCashAmounts, summarizePayments } from "./payment-math";
import { PAY_METHODS } from "./ticket-panel";

let paymentIdCounter = 0;

type PaymentModalProps = {
  defaultMethod: PayMethod;
  onClose: () => void;
  onSuccess: (sale: Sale) => void;
  sessionId: number;
  total: number;
};

/** Diálogo de cobro (diseño Industry, subfase 4.7): método, monto, pagos divididos, teclado y estado del cobro. */
export function PaymentModal({ defaultMethod, onClose, onSuccess, sessionId, total: initialTotal }: PaymentModalProps) {
  const cart = usePosStore((s) => s.cart);
  const clearCart = usePosStore((s) => s.clearCart);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [total, setTotal] = useState(initialTotal);
  const [initialPaymentId] = useState(() => ++paymentIdCounter);
  const [payments, setPayments] = useState<PaymentEntry[]>(() => [
    { id: initialPaymentId, method: defaultMethod, amount: initialTotal.toFixed(2), reference: "" },
  ]);
  const [activePaymentId, setActivePaymentId] = useState(initialPaymentId);
  const isSubmittingRef = useRef(false);
  const clientUuidRef = useRef<string>(crypto.randomUUID());

  // Pedir cotización oficial al backend al abrir el modal (H-04: si difiere del cálculo local, gana el quote)
  useEffect(() => {
    let isMounted = true;
    async function fetchQuote() {
      try {
        const quote = await quoteSale({
          session_id: sessionId,
          items: cart.map((c) => ({
            product_id: c.product_id,
            quantity: c.quantity.toFixed(3),
            discount_percent: c.discount_percent || "0",
          })),
        });
        if (!isMounted) return;
        const officialTotal = Number(quote.total);
        if (!isNaN(officialTotal)) {
          setTotal(officialTotal);
          // Si el usuario aún no ha modificado los pagos, actualizar el monto prellenado
          setPayments((prev) => {
            if (prev.length === 1 && prev[0].id === initialPaymentId) {
              return [{ ...prev[0], amount: officialTotal.toFixed(2) }];
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("No se pudo obtener quote del servidor, usando total local:", err);
      }
    }

    if (cart.length > 0) {
      fetchQuote();
    }

    return () => {
      isMounted = false;
    };
  }, [sessionId, cart, initialPaymentId]);

  const summary = summarizePayments(payments, total);
  const status = paymentStatus(summary);
  const activePayment = payments.find((p) => p.id === activePaymentId) ?? payments[0];

  function addPayment() {
    const nextId = ++paymentIdCounter;
    const amountToAdd = Math.max(0, summary.remaining);
    setPayments((current) => [
      ...current,
      { id: nextId, method: "efectivo", amount: amountToAdd > 0 ? amountToAdd.toFixed(2) : "0.00", reference: "" },
    ]);
    setActivePaymentId(nextId);
  }

  function removePayment(id: number) {
    if (payments.length <= 1) return;
    const next = payments.filter((p) => p.id !== id);
    setPayments(next);
    if (activePaymentId === id) {
      setActivePaymentId(next[0]?.id ?? initialPaymentId);
    }
  }

  function updatePayment(id: number, patch: Partial<Omit<PaymentEntry, "id">>) {
    setActivePaymentId(id);
    setPayments((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /** Cambia el monto del pago activo a partir de su valor actual (funcional: varias teclas seguidas no se pisan). */
  function editActiveAmount(edit: (current: string) => string) {
    setPayments((current) => current.map((p) => (p.id === activePayment.id ? { ...p, amount: edit(p.amount || "") } : p)));
  }

  const saleMutation = useMutation({
    mutationFn: (payload: CreateSalePayload) => createSale(payload),
    onSuccess: async (sale) => {
      clearCart();
      await invalidateAfterSale(queryClient);
      onSuccess(sale);
    },
  });

  async function handlePay() {
    if (isSubmittingRef.current || saleMutation.isPending) {
      return;
    }
    isSubmittingRef.current = true;

    try {
      const items: SaleItemInput[] = cart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity.toFixed(3),
        unit_price: c.unit_price,
        tax_rate: c.tax_rate,
        discount_percent: c.discount_percent,
      }));

      const paymentInputs: PaymentInput[] = payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.method !== "efectivo" && p.reference ? p.reference : undefined,
        change_amount: p === summary.lastCash && summary.cashChange > 0 ? summary.cashChange.toFixed(2) : "0.00",
      }));

      const payload: CreateSalePayload = {
        session_id: sessionId,
        client_uuid: clientUuidRef.current,
        items,
        payments: paymentInputs,
      };

      // Si el ping ya sabe que no hay servidor, no se espera un timeout: directo a la cola (RF-10)
      if (navigator.onLine && useConnectionStore.getState().serverReachable) {
        try {
          await saleMutation.mutateAsync(payload);
          return;
        } catch (err) {
          // H-03: Solo pasar a offline ante errores de red reales (!err.response o timeout).
          // Si el servidor respondió con 4xx o 5xx, NO pasar a offline:
          // mantener modal abierto, mostrar error del servidor y conservar el carrito.
          // 502/503/504 (puerta de enlace, base caída, restauración en curso): el servidor no procesó la venta y
          // se encola con su client_uuid; la sincronización es idempotente (RF-10)
          const isHttpError = err instanceof AxiosError && Boolean(err.response) && !isServerUnavailable(err);
          if (isHttpError) {
            const serverMsg = err.response?.data?.error ?? "Error al procesar la venta en el servidor.";
            toast.error(serverMsg);
            return;
          }

          console.warn("Fallo de red o timeout al enviar online; activando contingencia offline:", err);
        }
      }

      // Proceso Offline: ticket provisional con el usuario real y los totales de getCartTotals (1.2)
      const totals = getCartTotals(cart);
      const mockSale: Sale = {
        id: -Date.now(),
        folio: "PENDIENTE DE SINCRONIZAR",
        session_id: sessionId,
        user_id: user?.id ?? 0,
        username: user?.full_name || user?.username || "",
        subtotal: totals.subtotal.toFixed(2),
        discount_total: totals.discountTotal.toFixed(2),
        tax_total: totals.taxTotal.toFixed(2),
        total: totals.total.toFixed(2),
        status: "completada",
        cancel_reason: null,
        created_at: new Date().toISOString(),
        items: cart.map((c, i) => {
          const line = getCartTotals([c]);
          return {
            id: -i,
            product_id: c.product_id,
            product_name: c.product_name,
            product_sku: c.product_sku,
            quantity: c.quantity.toString(),
            unit_price: c.unit_price,
            discount_percent: c.discount_percent,
            discount_amount: line.discountTotal.toFixed(2),
            tax_rate: c.tax_rate,
            subtotal: line.subtotal.toFixed(2),
            cost_at_sale: c.unit_price,
          };
        }),
        payments: payments.map((p, i) => ({
          id: -i,
          method: p.method,
          amount: p.amount,
          reference: p.reference || null,
          change_amount: p === summary.lastCash && summary.cashChange > 0 ? summary.cashChange.toFixed(2) : "0.00",
        })),
      };

      // Guardar en cola asociada al usuario (H-18)
      usePosStore.getState().addOfflineSale(payload, user?.id, mockSale.total, cart);

      // Limpiar carrito y disparar éxito
      clearCart();
      toast.warning("Sin conexión. Venta guardada en este equipo: PENDIENTE DE SINCRONIZAR.");
      onSuccess(mockSale);
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const errorMessage = saleMutation.error
    ? saleMutation.error instanceof AxiosError
      ? (saleMutation.error.response?.data?.error ?? "Error al procesar la venta.")
      : "Error al procesar la venta."
    : "";
  const isCash = activePayment.method === "efectivo";

  return (
    <Modal
      footer={
        <>
          <Button className="h-12 px-5 text-base" onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            className="h-12 px-6 text-lg"
            disabled={!summary.sufficient || saleMutation.isPending || isSubmittingRef.current || cart.length === 0}
            frame
            onClick={handlePay}
          >
            {saleMutation.isPending ? "Procesando…" : `Completar cobro ${formatCurrency(total)}`}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="wide"
      title="Cobrar venta"
    >
      <div className="-m-5 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Izquierda: total, método, monto, pagos divididos y estado del cobro */}
        <div className="flex flex-col gap-4 p-5 lg:border-r lg:border-divider">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-[0.9375rem] font-semibold uppercase tracking-[0.1em] text-ink-2">Total a pagar</span>
            <span className="font-heading text-5xl font-semibold leading-none tabular-nums">{formatCurrency(total)}</span>
          </div>

          <Segmented
            aria-label="Método del pago activo"
            fullWidth
            onChange={(method) => updatePayment(activePayment.id, { method, reference: "" })}
            options={PAY_METHODS.map((m) => ({ icon: <m.icon aria-hidden="true" size={17} />, label: m.label, value: m.value }))}
            value={activePayment.method}
          />

          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-ink-2" htmlFor="pay-amount">
              {isCash ? "Monto recibido" : "Monto cobrado"}
            </label>
            <div className="flex h-[60px] items-center gap-2 border border-accent bg-surface px-3.5">
              <span aria-hidden="true" className="font-heading text-[1.75rem] font-semibold text-ink-2">$</span>
              <input
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent font-heading text-[2.125rem] font-semibold tabular-nums text-text outline-none"
                id="pay-amount"
                inputMode="decimal"
                onChange={(e) => updatePayment(activePayment.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                value={activePayment.amount}
              />
            </div>
          </div>

          {isCash ? (
            <div className="flex flex-wrap gap-1.5">
              {quickCashAmounts(total).map((amount) => (
                <Button
                  className="h-10 min-h-10 flex-1 text-base tabular-nums"
                  key={amount}
                  onClick={() => updatePayment(activePayment.id, { amount: amount.toFixed(2) })}
                  variant="secondary"
                >
                  {amount === total ? "Exacto" : formatCurrency(amount)}
                </Button>
              ))}
            </div>
          ) : (
            <Input
              className="min-h-11 text-base"
              label="Referencia de pago"
              name="pay-reference"
              onChange={(e) => updatePayment(activePayment.id, { reference: e.target.value })}
              placeholder="Últimos 4 dígitos del voucher"
              value={activePayment.reference}
            />
          )}

          {payments.length > 1 ? (
            <ul aria-label="Pagos registrados" className="flex max-h-[156px] flex-col overflow-y-auto border border-divider">
              {payments.map((p, idx) => (
                <li
                  className={cn("flex items-center gap-2.5 border-b border-line-soft px-3 py-1 last:border-b-0", p.id === activePaymentId && "bg-acc-tint")}
                  key={p.id}
                >
                  <button className="flex min-h-9 flex-1 items-center justify-between gap-3 text-left" onClick={() => setActivePaymentId(p.id)} type="button">
                    <span>
                      {idx + 1}. {PAY_METHODS.find((m) => m.value === p.method)?.label}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(Number(p.amount) || 0)}</span>
                  </button>
                  <Button aria-label={`Quitar el pago ${idx + 1}`} className="h-9 min-h-0 w-9 px-0 text-ink-2" onClick={() => removePayment(p.id)} variant="ghost">
                    <X aria-hidden="true" size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button onClick={addPayment} size="sm" variant="ghost">
              <Plus aria-hidden="true" size={15} />
              Dividir en otro método de pago
            </Button>
            {payments.length > 1 ? (
              <span className="text-sm text-ink-2">
                Suma de pagos: <span className="font-medium tabular-nums text-text">{formatCurrency(summary.paid)}</span>
              </span>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div
            className={cn(
              "mt-auto flex items-baseline justify-between gap-3 border px-4 py-3.5",
              status.tone === "bad" ? "border-bad bg-bad-tint text-bad" : "border-ok bg-ok-tint text-ok",
            )}
            role="status"
          >
            <span className="font-heading text-base font-semibold uppercase tracking-[0.08em]">{status.label}</span>
            <span className="font-heading text-[2.375rem] font-semibold leading-none tabular-nums">{formatCurrency(status.value)}</span>
          </div>
        </div>

        {/* Derecha: teclado numérico táctil */}
        <div className="flex flex-col gap-2 p-5">
          <div className="grid grid-cols-3 gap-px border border-divider bg-divider">
            {KEYPAD_KEYS.map((key) => (
              <button
                aria-label={key === "backspace" ? "Borrar el último dígito" : key === "." ? "Punto decimal" : key}
                className="grid h-16 place-items-center bg-bg font-heading text-[1.625rem] font-semibold transition-colors duration-100 hover:bg-acc-tint active:bg-line-soft"
                key={key}
                onClick={() => editActiveAmount((current) => applyKeypad(current, key))}
                type="button"
              >
                {key === "backspace" ? <Delete aria-hidden="true" size={22} /> : key}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 text-base" onClick={() => updatePayment(activePayment.id, { amount: total.toFixed(2) })} variant="secondary">
              Exacto
            </Button>
            <Button className="h-11 text-base" onClick={() => editActiveAmount((current) => applyKeypad(current, "clear"))} variant="secondary">
              Limpiar
            </Button>
          </div>
        </div>
      </div>

    </Modal>
  );
}
