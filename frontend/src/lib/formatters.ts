/**
 * Format a stock quantity: remove unnecessary trailing zeros.
 * "35.000" → "35", "35.500" → "35.5", "0.750" → "0.75"
 */
export function formatStock(qty: string | number): string {
  const n = typeof qty === "string" ? parseFloat(qty) : qty;
  if (Number.isNaN(n)) return String(qty);
  // Use up to 3 decimal places, then strip trailing zeros
  return parseFloat(n.toFixed(3)).toString();
}

/**
 * Format a currency amount for display: $1,234.56
 */
export function formatCurrency(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return String(amount);
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
