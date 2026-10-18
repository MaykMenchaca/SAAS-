/** Clasificación del nivel de stock y escala de la barra de nivel (mín / máx). */

export type StockLevel = "agotado" | "bajo" | "normal";

/** Bajo el mínimo: solo cuenta si el producto tiene un mínimo definido; igual al mínimo ya es bajo (RF-23). */
export function isBelowMin(qty: number, min: number): boolean {
  return min > 0 && qty <= min;
}

export function stockLevel(qty: number, min: number): StockLevel {
  if (qty <= 0) return "agotado";
  return isBelowMin(qty, min) ? "bajo" : "normal";
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Porcentajes de la barra: relleno (stock) y marca del mínimo. Sin máximo definido,
 * la escala es el doble del mínimo (o el propio stock) para que la barra siga siendo legible.
 */
export function levelBar(qty: number, min: number, max: number): { fill: number; minMark: number | null } {
  const scale = max > 0 ? max : Math.max(min * 2, qty, 1);
  return { fill: clamp((qty / scale) * 100), minMark: min > 0 ? clamp((min / scale) * 100) : null };
}

/** Diferencia redondeada a milésimas (las cantidades tienen hasta 3 decimales). */
export function quantityDelta(next: string, current: string): number | null {
  if (next.trim() === "") return null;
  const n = Number(next);
  const c = Number(current);
  if (!Number.isFinite(n) || !Number.isFinite(c)) return null;
  return Math.round((n - c) * 1000) / 1000;
}

export function formatDelta(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

/** Folio de un conteo físico: CF-0008. */
export function countFolio(id: number): string {
  return `CF-${String(id).padStart(4, "0")}`;
}
