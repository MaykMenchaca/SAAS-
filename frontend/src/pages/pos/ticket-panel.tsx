import { Banknote, CircleCheck, CreditCard, Landmark, Minus, Percent, Plus, Printer, ScanBarcode, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Sale } from "../../api/sales";
import { Button, Kbd, Segmented } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatCurrency } from "../../lib/formatters";
import type { CartItem } from "../../stores/pos-store";
import { getCartTotals, usePosStore } from "../../stores/pos-store";
import { clampDiscount, customDiscountText, DISCOUNT_PRESETS, formatQty, FRACTION_QUICK, qtyStep, roundQty, sanitizeQtyInput } from "./cart-helpers";
import type { PayMethod } from "./payment-math";

export const PAY_METHODS = [
  { icon: Banknote, label: "Efectivo", value: "efectivo" },
  { icon: CreditCard, label: "Tarjeta", value: "tarjeta" },
  { icon: Landmark, label: "Transferencia", value: "transferencia" },
] as const;

/** Cambio entregado en una venta ya registrada: suma del `change_amount` de sus pagos. */
export function saleChange(sale: Sale): number {
  return sale.payments.reduce((sum, p) => sum + (Number(p.change_amount) || 0), 0);
}

// ── Línea del ticket ───────────────────────────────────────────────

function TicketLine({ canDiscount, item }: { canDiscount: boolean; item: CartItem }) {
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const updateDiscount = usePosStore((s) => s.updateDiscount);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const frac = Boolean(item.allows_fractions);
  const step = qtyStep(frac);
  const [draft, setDraft] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState(false);

  const discount = Number(item.discount_percent || 0);
  // Importes de la línea antes de IVA (el IVA va en el pie del ticket): bruto, descuento y neto
  const line = getCartTotals([item]);
  const net = line.subtotal;
  const gross = line.subtotal + line.discountTotal;

  function commitDraft() {
    if (draft === null) return;
    const value = parseFloat(draft);
    if (value > 0) updateQuantity(item.product_id, roundQty(value));
    setDraft(null);
  }

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 border-b border-line-soft px-5 py-3.5", editingDiscount && "bg-acc-tint")}>
      <div className="min-w-0">
        <div className="font-medium leading-snug">{item.product_name}</div>
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] tabular-nums text-ink-2">
          <span>
            {formatCurrency(item.unit_price)} × {formatQty(item.quantity, frac)} {item.unit_abbreviation}
          </span>
          {discount > 0 ? <span className="bg-acc-tint px-1.5 text-xs text-acc-text">−{discount}%</span> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="whitespace-nowrap font-heading text-xl font-semibold tabular-nums">{formatCurrency(net)}</div>
        {discount > 0 ? <div className="text-xs tabular-nums text-ink-2 line-through">{formatCurrency(gross)}</div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button aria-label={`Quitar ${formatQty(step, frac)} ${item.unit_abbreviation}`} className="w-11 px-0 lg:min-h-9 lg:w-9" onClick={() => updateQuantity(item.product_id, roundQty(item.quantity - step))} variant="secondary">
            <Minus aria-hidden="true" size={15} />
          </Button>
          <input
            aria-label={`Cantidad de ${item.product_name}`}
            className={cn("h-11 border-y border-divider bg-surface text-center text-[0.9375rem] font-medium tabular-nums lg:h-9", frac ? "w-[72px]" : "w-14")}
            inputMode="decimal"
            onBlur={commitDraft}
            onChange={(e) => setDraft(sanitizeQtyInput(e.target.value, frac))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            value={draft ?? formatQty(item.quantity, frac)}
          />
          <Button aria-label={`Agregar ${formatQty(step, frac)} ${item.unit_abbreviation}`} className="w-11 px-0 lg:min-h-9 lg:w-9" onClick={() => updateQuantity(item.product_id, roundQty(item.quantity + step))} variant="secondary">
            <Plus aria-hidden="true" size={15} />
          </Button>
        </div>
        {frac ? <span className="whitespace-nowrap text-xs text-ink-2">{item.unit_abbreviation} · admite decimales</span> : null}
      </div>

      <div className="flex justify-self-end">
        {canDiscount ? (
          <Button aria-expanded={editingDiscount} aria-label={`Descuento de ${item.product_name}`} onClick={() => setEditingDiscount((v) => !v)} size="sm" variant="ghost">
            <Percent aria-hidden="true" size={14} />
            Desc.
          </Button>
        ) : null}
        <Button aria-label={`Quitar ${item.product_name} del ticket`} className="text-bad" onClick={() => removeFromCart(item.product_id)} size="sm" variant="ghost">
          Quitar
        </Button>
      </div>

      {frac ? (
        <div className="col-span-full flex flex-wrap gap-1.5">
          {FRACTION_QUICK.map((q) => (
            <Button
              aria-label={`${formatQty(q, true)} ${item.unit_abbreviation}`}
              className={cn("min-h-9 px-2.5 text-sm tabular-nums", item.quantity === q && "bg-acc-tint")}
              key={q}
              onClick={() => updateQuantity(item.product_id, q)}
              variant="secondary"
            >
              {formatQty(q, true)} {item.unit_abbreviation}
            </Button>
          ))}
        </div>
      ) : null}

      {canDiscount && editingDiscount ? (
        <div className="col-span-full flex flex-wrap items-center gap-2 border border-accent bg-bg p-2.5">
          <span className="text-[0.8125rem] text-ink-2">Descuento</span>
          <Segmented
            aria-label="Descuento de la línea"
            onChange={(d) => updateDiscount(item.product_id, clampDiscount(d).toFixed(2))}
            options={DISCOUNT_PRESETS.map((d) => ({ label: d ? `${d}%` : "Sin", value: d }))}
            size="sm"
            value={(DISCOUNT_PRESETS as readonly number[]).includes(discount) ? discount : -1}
          />
          <label className="flex items-center gap-1 text-[0.8125rem] text-ink-2">
            <span className="sr-only">Otro descuento en porcentaje</span>
            <input
              className="h-9 w-14 border border-field-border bg-surface px-1.5 text-right text-[0.8125rem] text-text"
              inputMode="decimal"
              onChange={(e) => {
                const value = parseFloat(e.target.value.replace(",", "."));
                updateDiscount(item.product_id, clampDiscount(value).toFixed(2));
              }}
              placeholder="Otro"
              defaultValue={customDiscountText(discount)}
            />
            %
          </label>
          <Button className="ml-auto" onClick={() => setEditingDiscount(false)} size="sm" variant="ghost">
            Listo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Panel del ticket ───────────────────────────────────────────────

type TicketPanelProps = {
  canDiscount: boolean;
  cart: CartItem[];
  cashierName: string;
  lastSale: Sale | null;
  method: PayMethod;
  onClear: () => void;
  onMethod: (method: PayMethod) => void;
  onPay: () => void;
  onPrintLast: () => void;
  sessionName: string;
};

/** Lado derecho del POS: venta en curso, totales, método de pago rápido y "Cobrar" (subfases 4.5, 4.6 y 4.8). */
export function TicketPanel({ canDiscount, cart, cashierName, lastSale, method, onClear, onMethod, onPay, onPrintLast, sessionName }: TicketPanelProps) {
  const totals = getCartTotals(cart);
  const gross = totals.subtotal + totals.discountTotal;
  const hasDiscount = totals.discountTotal > 0;
  const empty = cart.length === 0;

  return (
    <aside aria-label="Venta en curso" className="flex min-h-[28rem] min-w-0 flex-col border-t border-divider md:min-h-0 md:border-l md:border-t-0">
      <div className="flex shrink-0 items-center gap-3 border-b border-divider px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl leading-[1.1]">Venta en curso</h2>
          <div className="truncate text-[0.8125rem] text-ink-2">
            {sessionName} · {cashierName}
          </div>
        </div>
        <Button aria-label="Vaciar ticket" className="w-11 px-0 lg:min-h-9 lg:w-9" disabled={empty} onClick={onClear} title="Vaciar ticket (Esc)" variant="secondary">
          <Trash2 aria-hidden="true" size={16} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty && lastSale ? (
          <div className="m-5 mb-0 flex flex-col gap-2 border border-ok bg-ok-tint p-3.5" role="status">
            <div className="flex items-center gap-2 font-heading text-[1.0625rem] font-semibold text-ok">
              <CircleCheck aria-hidden="true" size={18} />
              Venta completada
            </div>
            <div className="text-sm">
              {lastSale.folio} · Total {formatCurrency(lastSale.total)}
            </div>
            <div className="font-heading text-[1.75rem] font-semibold leading-none tabular-nums">Cambio {formatCurrency(saleChange(lastSale))}</div>
            {lastSale.id > 0 ? (
              <Button className="self-start" onClick={onPrintLast} size="sm" variant="secondary">
                <Printer aria-hidden="true" size={15} />
                Imprimir ticket
                <Kbd aria-hidden="true">F8</Kbd>
              </Button>
            ) : (
              <p className="text-[0.8125rem] text-ink-2">Guardada en este equipo: se enviará al servidor al volver la conexión.</p>
            )}
          </div>
        ) : null}

        {empty && !lastSale ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-ink-2">
            <ScanBarcode aria-hidden="true" size={34} />
            <div className="text-[0.9375rem] text-text">El ticket está vacío</div>
            <div className="text-[0.8125rem]">Escanea un producto o tócalo en el catálogo.</div>
          </div>
        ) : null}

        {cart.map((item) => (
          <TicketLine canDiscount={canDiscount} item={item} key={item.product_id} />
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-divider px-5 pb-4 pt-3.5">
        <div className="flex flex-col gap-1 text-sm text-ink-2">
          <div className="flex justify-between gap-3 whitespace-nowrap">
            <span>
              Subtotal · {cart.length} {cart.length === 1 ? "artículo" : "artículos"}
            </span>
            <span className="tabular-nums">{formatCurrency(hasDiscount ? gross : totals.subtotal)}</span>
          </div>
          {hasDiscount ? (
            <div className="flex justify-between gap-3 whitespace-nowrap text-acc-text">
              <span>Descuentos</span>
              <span className="tabular-nums">−{formatCurrency(totals.discountTotal)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 whitespace-nowrap">
            <span>IVA</span>
            <span className="tabular-nums">{formatCurrency(totals.taxTotal)}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-divider pt-2.5">
          <span className="font-heading text-xl font-semibold uppercase tracking-[0.06em]">Total</span>
          <span className="whitespace-nowrap font-heading text-[clamp(2.125rem,3.4vw,3.25rem)] font-semibold leading-none tabular-nums">{formatCurrency(totals.total)}</span>
        </div>

        <Segmented
          aria-label="Método de pago"
          fullWidth
          onChange={onMethod}
          options={PAY_METHODS.map((m) => ({ icon: <m.icon aria-hidden="true" size={15} />, label: m.label, value: m.value }))}
          size="sm"
          value={method}
        />

        <Button className="h-[60px] w-full justify-between px-[18px] text-[1.375rem]" disabled={empty} frame onClick={onPay}>
          <span className="flex items-center gap-2.5">
            Cobrar
            <Kbd aria-hidden="true" className="border-current font-sans text-[0.8125rem] text-current opacity-80">F5</Kbd>
          </span>
          <span className="tabular-nums">{formatCurrency(totals.total)}</span>
        </Button>
      </div>
    </aside>
  );
}
