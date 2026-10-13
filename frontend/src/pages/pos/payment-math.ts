import { sumPaymentsCents, toCents } from "../../stores/pos-store";

/**
 * Lógica pura del cobro (extraída de PaymentModal sin cambiar su comportamiento). El servidor sigue siendo la
 * autoridad sobre el total, el cambio y los pagos: esto solo da la vista previa y bloquea el botón.
 */

export type PayMethod = "efectivo" | "tarjeta" | "transferencia";

export type PaymentEntry = {
  id: number;
  method: PayMethod;
  amount: string;
  reference: string;
};

/** Denominaciones de billetes para los atajos de pago rápido (peso mexicano). */
export const MXN_BILL_DENOMINATIONS = [50, 100, 200, 500, 1000] as const;

/** Teclado numérico del cobro: 3 × 4, con "retroceso" al final. */
export const KEYPAD_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "backspace"] as const;

/** Aplica una tecla al monto en captura: sin doble punto, sin ceros a la izquierda ("0" + "5" → "5"). */
export function applyKeypad(current: string, key: string): string {
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);
  if (key === "." && current.includes(".")) return current;
  if ((current === "0" || current === "0.00") && key !== ".") return key;
  return `${current}${key}`;
}

/** "Exacto" + los billetes que alcanzan para el total (hasta 5 atajos). */
export function quickCashAmounts(total: number): number[] {
  return Array.from(new Set([total, ...MXN_BILL_DENOMINATIONS]))
    .filter((amount) => amount >= total || amount === total)
    .slice(0, 5);
}

export type PaymentSummary = {
  paidCents: number;
  totalCents: number;
  /** Suma de los pagos capturados, en pesos. */
  paid: number;
  /** Lo que falta por cobrar (≤ 0 si ya alcanza), en pesos. */
  remaining: number;
  /** Último pago en efectivo: el cambio se entrega de ese. */
  lastCash: PaymentEntry | undefined;
  /** Cambio a entregar (solo con efectivo y el cobro completo), en pesos. */
  cashChange: number;
  sufficient: boolean;
};

/**
 * Sumas y comparaciones en centavos enteros: 10 + 1.13 en flotantes da 11.129999… y dejaba deshabilitado
 * "Completar cobro" con el pago exacto (FE-104).
 */
export function summarizePayments(payments: PaymentEntry[], total: number): PaymentSummary {
  const paidCents = sumPaymentsCents(payments);
  const totalCents = toCents(total);
  const remaining = (totalCents - paidCents) / 100;
  const lastCash = [...payments].reverse().find((p) => p.method === "efectivo");
  const cashChange = lastCash && remaining <= 0 ? Math.max(0, (paidCents - totalCents) / 100) : 0;
  return { paidCents, totalCents, paid: paidCents / 100, remaining, lastCash, cashChange, sufficient: paidCents >= totalCents };
}

/** Etiqueta y tono del recuadro de estado del cobro. */
export function paymentStatus(summary: PaymentSummary): { label: string; value: number; tone: "bad" | "ok" } {
  if (summary.remaining > 0) return { label: "Falta por cobrar", value: summary.remaining, tone: "bad" };
  return { label: summary.cashChange > 0 ? "Cambio a entregar" : "Cobro completo", value: summary.cashChange, tone: "ok" };
}
