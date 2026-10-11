/**
 * Format a stock quantity: remove unnecessary trailing zeros.
 * "35.000" → "35", "35.500" → "35.5", "0.750" → "0.75"
 */
export function formatStock(qty: string | number | null | undefined): string {
  if (qty == null) return "0";
  const n = typeof qty === "string" ? parseFloat(qty) : qty;
  if (Number.isNaN(n)) return String(qty);
  // Use up to 3 decimal places, then strip trailing zeros
  return parseFloat(n.toFixed(3)).toString();
}

/**
 * Format a quantity considering its unit or fractional capability (UI-10).
 * Prevents "1.000 uds" or "0.000 / min 20.000" for discrete pieces.
 */
export function formatQuantity(
  qty: string | number | null | undefined,
  unit?: { allows_fractions?: boolean; abbreviation?: string; name?: string } | string
): string {
  if (qty == null) return "0";
  const n = typeof qty === "string" ? parseFloat(qty) : qty;
  if (Number.isNaN(n)) return String(qty);

  let allowsFractions = false;
  if (typeof unit === "object" && unit !== null) {
    if (typeof unit.allows_fractions === "boolean") {
      allowsFractions = unit.allows_fractions;
    } else {
      const label = (unit.abbreviation || unit.name || "").toLowerCase().trim();
      allowsFractions = /^(kg|kilo|kilos|g|gr|gramos|m|metro|metros|l|lt|litro|litros)$/i.test(label);
    }
  } else if (typeof unit === "string") {
    const label = unit.toLowerCase().trim();
    allowsFractions = /^(kg|kilo|kilos|g|gr|gramos|m|metro|metros|l|lt|litro|litros)$/i.test(label);
  }

  if (!allowsFractions && Number.isInteger(n)) {
    return Math.trunc(n).toString();
  }

  return parseFloat(n.toFixed(3)).toString();
}

/**
 * Format min / max stock display cleanly (UI-10).
 * Replaces ambiguous "MIN/MAX 8 / 0" with "Mín: 8 / Máx: —".
 */
export function formatStockLimits(
  minStock?: string | number | null,
  maxStock?: string | number | null
): string {
  const min = minStock != null ? parseFloat(String(minStock)) : 0;
  const max = maxStock != null ? parseFloat(String(maxStock)) : 0;
  const minStr = Number.isNaN(min) ? "0" : formatStock(min);
  const maxStr = Number.isNaN(max) || max <= 0 ? "—" : formatStock(max);
  return `Mín: ${minStr} / Máx: ${maxStr}`;
}

/**
 * Format a currency amount for display: $1,234.56
 */
export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "$0.00";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return String(amount);
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
