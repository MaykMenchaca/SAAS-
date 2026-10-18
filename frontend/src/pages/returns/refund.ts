import type { SaleItem } from "../../api/sales";

/** Cantidad de la línea de devolución (texto del campo) como número; NaN si no es válida. */
export function parseQty(value: string): number {
  const n = Number(value);
  return value.trim() === "" ? Number.NaN : n;
}

/** Texto de una cantidad con hasta 3 decimales y sin ceros sobrantes ("1.500" → "1.5"). */
export function qtyText(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

/** num / den redondeado al entero par en las mitades (HALF_EVEN), exacto con enteros no negativos. */
export function divHalfEven(num: number, den: number): number {
  const q = Math.floor(num / den);
  const twiceRest = 2 * (num - q * den);
  if (twiceRest > den || (twiceRest === den && q % 2 !== 0)) return q + 1;
  return q;
}

/** Parte de `amountCents` que corresponde a `qtyMilli` de `soldMilli` unidades (en milésimas), como el servidor. */
function upto(amountCents: number, qtyMilli: number, soldMilli: number): number {
  if (qtyMilli >= soldMilli) return amountCents;
  return divHalfEven(amountCents * qtyMilli, soldMilli);
}

/**
 * Estimado del reembolso de una línea en centavos enteros (el servidor calcula el monto final).
 * Misma fórmula que `_refund_upto` del servidor (RF-49): reembolso ACUMULADO de la partida,
 * refund(q) = round(total × (devuelto + q) / vendido) − round(total × devuelto / vendido), con
 * total = subtotal + round(subtotal × IVA / 100), todo HALF_EVEN. El subtotal se reparte igual y el IVA
 * es la diferencia, para que subtotal + IVA cuadren con el total.
 */
export function estimateLineCents(
  item: Pick<SaleItem, "subtotal" | "quantity" | "tax_rate" | "returned_quantity">,
  qty: number,
) {
  // Cantidades en milésimas (el servidor guarda 3 decimales) y montos en centavos: aritmética entera exacta
  const soldMilli = Math.round(Number(item.quantity) * 1000);
  const qtyMilli = Math.round(qty * 1000);
  if (!(soldMilli > 0) || !(qtyMilli > 0)) return { subCents: 0, taxCents: 0, totalCents: 0 };
  const prevMilli = Math.max(0, Math.round(Number(item.returned_quantity ?? 0) * 1000) || 0);
  const lineSubCents = Math.round(Number(item.subtotal) * 100);
  const lineTaxCents = divHalfEven(lineSubCents * Math.round(Number(item.tax_rate) * 100), 10000);
  const lineTotalCents = lineSubCents + lineTaxCents;
  const totalCents = upto(lineTotalCents, prevMilli + qtyMilli, soldMilli) - upto(lineTotalCents, prevMilli, soldMilli);
  const subCents = upto(lineSubCents, prevMilli + qtyMilli, soldMilli) - upto(lineSubCents, prevMilli, soldMilli);
  return { subCents, taxCents: totalCents - subCents, totalCents };
}

/** Error de una cantidad a devolver, o "" si es válida (según el máximo disponible y la unidad). */
export function qtyError(value: string, max: number, allowsFractions: boolean): string {
  const n = parseQty(value);
  if (!(n > 0)) return "Escribe una cantidad mayor a 0.";
  if (n > max + 1e-9) return `Máximo ${qtyText(max)}.`;
  if (!allowsFractions && !Number.isInteger(n)) return "Esta unidad solo admite cantidades enteras.";
  return "";
}
