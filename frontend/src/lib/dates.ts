/**
 * Fecha local en formato YYYY-MM-DD.
 * No usar `toISOString()`: convierte a UTC y desde las 18:00 en México ya es el día siguiente.
 */
export function localISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Fecha local desplazada `days` días (negativo hacia atrás). */
export function addLocalDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
