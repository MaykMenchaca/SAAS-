/** Cálculos de precio, utilidad y margen de un producto. El dinero se maneja en centavos enteros. */
import { formatCurrency } from "../../lib/formatters";

/** Convierte un importe en texto ("12.50") a centavos enteros. Vacío o no numérico = 0. */
export function toCents(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Costo vigente: el promedio si existe; si no, el último costo de compra. */
export function costCents(avgCost: string | null | undefined, purchasePrice: string | null | undefined): number {
  const avg = toCents(avgCost);
  return avg > 0 ? avg : toCents(purchasePrice);
}

/** Precio de venta con IVA (el precio de venta se captura sin IVA). */
export function priceWithTaxCents(priceCents: number, taxRate: string | number | null | undefined): number {
  const rate = Number(taxRate);
  return Math.round(priceCents * (1 + (Number.isFinite(rate) ? rate : 0) / 100));
}

/** Utilidad por pieza antes de IVA. */
export function profitCents(priceCents: number, cost: number): number {
  return priceCents - cost;
}

/** Margen sobre el precio de venta, en porcentaje. `null` si no hay precio. */
export function marginPct(priceCents: number, cost: number): number | null {
  if (priceCents <= 0) return null;
  return ((priceCents - cost) / priceCents) * 100;
}

/** "42.5 %" con un decimal; "—" si no se puede calcular. */
export function formatMargin(pct: number | null): string {
  return pct == null ? "—" : `${pct.toFixed(1)} %`;
}

export function formatCents(cents: number): string {
  return formatCurrency(cents / 100);
}

/** Margen por debajo de este valor se muestra en aviso. */
export const LOW_MARGIN_PCT = 15;
