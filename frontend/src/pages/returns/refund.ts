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

/**
 * Estimado del reembolso de una línea en centavos enteros (el servidor calcula el monto final):
 * parte proporcional del subtotal de la línea más su IVA.
 */
export function estimateLineCents(item: Pick<SaleItem, "subtotal" | "quantity" | "tax_rate">, qty: number) {
  const soldQty = Number(item.quantity);
  if (!(soldQty > 0) || !(qty > 0)) return { subCents: 0, taxCents: 0, totalCents: 0 };
  const subCents = Math.round((Number(item.subtotal) * 100 * qty) / soldQty);
  const taxCents = Math.round((subCents * Number(item.tax_rate)) / 100);
  return { subCents, taxCents, totalCents: subCents + taxCents };
}

/** Error de una cantidad a devolver, o "" si es válida (según el máximo disponible y la unidad). */
export function qtyError(value: string, max: number, allowsFractions: boolean): string {
  const n = parseQty(value);
  if (!(n > 0)) return "Escribe una cantidad mayor a 0.";
  if (n > max + 1e-9) return `Máximo ${qtyText(max)}.`;
  if (!allowsFractions && !Number.isInteger(n)) return "Esta unidad solo admite cantidades enteras.";
  return "";
}
