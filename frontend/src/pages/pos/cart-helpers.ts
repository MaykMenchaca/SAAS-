/** Ayudas puras del ticket del POS: cantidades fraccionarias y descuentos por línea. */

/** Atajos de cantidad para productos que se venden a granel (kg, m, lt). */
export const FRACTION_QUICK = [0.25, 0.5, 1, 2.5, 5, 10] as const;

/** Descuentos predefinidos por línea (el 0 se muestra como "Sin"). */
export const DISCOUNT_PRESETS = [0, 5, 10, 15, 20] as const;

/** Paso de los botones − / +: de medio en medio para fraccionables, de uno en uno para piezas. */
export function qtyStep(allowsFractions: boolean): number {
  return allowsFractions ? 0.5 : 1;
}

/** Muestra una cantidad sin ceros sobrantes: 12.5 → "12.5", 2 → "2", 0.250 → "0.25". */
export function formatQty(quantity: number, allowsFractions: boolean): string {
  if (Number.isInteger(quantity)) return String(quantity);
  const text = quantity.toFixed(allowsFractions ? 3 : 0).replace(/0+$/, "").replace(/\.$/, "");
  return text === "" ? "0" : text;
}

/** Limpia lo que escribe el cajero: coma → punto; solo dígitos (y un punto si la unidad admite fracciones). */
export function sanitizeQtyInput(raw: string, allowsFractions: boolean): string {
  const text = raw.replace(",", ".").replace(allowsFractions ? /[^0-9.]/g : /[^0-9]/g, "");
  if (!allowsFractions) return text;
  const [whole, ...rest] = text.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

/** Cantidad con 3 decimales máximo (el servidor guarda `Numeric(…, 3)`). */
export function roundQty(quantity: number): number {
  return Math.round(quantity * 1000) / 1000;
}

/** Descuento permitido en la interfaz: 0 a 100 con 2 decimales. El servidor valida el tope real y el permiso. */
export function clampDiscount(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

/** Texto del campo "Otro" del descuento: vacío cuando el valor es uno de los predefinidos. */
export function customDiscountText(discount: number): string {
  return (DISCOUNT_PRESETS as readonly number[]).includes(discount) ? "" : String(discount);
}
