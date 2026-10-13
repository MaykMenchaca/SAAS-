import { formatCurrency } from "../../lib/formatters";

export type Denomination = { label: string; value: number; type: "bill" | "coin" };

/** Denominaciones MXN en circulación (billetes y monedas), de mayor a menor. */
export const DENOMINATIONS: Denomination[] = [
  { label: "$1,000", value: 1000, type: "bill" },
  { label: "$500", value: 500, type: "bill" },
  { label: "$200", value: 200, type: "bill" },
  { label: "$100", value: 100, type: "bill" },
  { label: "$50", value: 50, type: "bill" },
  { label: "$20", value: 20, type: "bill" },
  { label: "$10", value: 10, type: "coin" },
  { label: "$5", value: 5, type: "coin" },
  { label: "$2", value: 2, type: "coin" },
  { label: "$1", value: 1, type: "coin" },
  { label: "$0.50", value: 0.5, type: "coin" },
];

export type DenominationCount = Record<number, number>;

/** Conteo en ceros para todas las denominaciones. */
export function emptyCounts(): DenominationCount {
  const initial: DenominationCount = {};
  for (const d of DENOMINATIONS) initial[d.value] = 0;
  return initial;
}

/** Total contado en pesos; se calcula en centavos enteros para no arrastrar error de coma flotante. */
export function calcDenominationTotal(counts: DenominationCount): number {
  const cents = DENOMINATIONS.reduce((sum, d) => sum + Math.round(d.value * 100) * (counts[d.value] ?? 0), 0);
  return cents / 100;
}

/** Diferencia contado − esperado, redondeada a centavos. */
export function cashDifference(counted: number, expected: number): number {
  return Math.round((counted - expected) * 100) / 100;
}

export type DifferenceTone = "empty" | "ok" | "short" | "over";

export function differenceTone(difference: number | null, hasCount: boolean): DifferenceTone {
  if (!hasCount || difference === null) return "empty";
  if (Math.abs(difference) < 0.01) return "ok";
  return difference < 0 ? "short" : "over";
}

/** "+$12.00" / "−$12.00" / "$0.00" */
export function formatSigned(amount: number): string {
  if (Math.abs(amount) < 0.01) return formatCurrency(0);
  return `${amount > 0 ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
}
