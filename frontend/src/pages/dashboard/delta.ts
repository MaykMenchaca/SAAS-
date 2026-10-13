/** Variación contra el periodo anterior; null si no hay base de comparación (H-27). */
export function formatDelta(current: number, previous: number, kind: "percent" | "count"): string | null {
  if (!previous) return null;
  const diff = current - previous;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  if (kind === "count") return `${sign}${Math.abs(diff)} vs ayer`;
  return `${sign}${Math.abs((diff / previous) * 100).toFixed(1)}%`;
}
