import { describe, expect, it } from "vitest";

import { applyKeypad, KEYPAD_KEYS, MXN_BILL_DENOMINATIONS, paymentStatus, quickCashAmounts, summarizePayments } from "../payment-math";
import type { PaymentEntry } from "../payment-math";

const pay = (method: PaymentEntry["method"], amount: string, id = 1): PaymentEntry => ({ id, method, amount, reference: "" });

describe("applyKeypad", () => {
  it("agrega dígitos al monto", () => {
    expect(applyKeypad("", "1")).toBe("1");
    expect(applyKeypad("12", "5")).toBe("125");
  });

  it("no permite dos puntos decimales", () => {
    expect(applyKeypad("12.5", ".")).toBe("12.5");
    expect(applyKeypad("12", ".")).toBe("12.");
  });

  it("un cero inicial se reemplaza por el dígito (0 + 5 → 5), pero 0 + . conserva el cero", () => {
    expect(applyKeypad("0", "5")).toBe("5");
    expect(applyKeypad("0.00", "7")).toBe("7");
    expect(applyKeypad("0", ".")).toBe("0.");
  });

  it("retroceso borra el último carácter y limpiar vacía el campo", () => {
    expect(applyKeypad("125", "backspace")).toBe("12");
    expect(applyKeypad("", "backspace")).toBe("");
    expect(applyKeypad("125.50", "clear")).toBe("");
  });

  it("el teclado tiene 12 teclas: 10 dígitos, punto y retroceso", () => {
    expect(KEYPAD_KEYS).toHaveLength(12);
    expect(KEYPAD_KEYS.filter((k) => /\d/.test(k))).toHaveLength(10);
    expect(KEYPAD_KEYS).toContain("backspace");
  });
});

describe("quickCashAmounts", () => {
  it("empieza por el total exacto y sigue con los billetes que alcanzan", () => {
    expect(quickCashAmounts(173.88)).toEqual([173.88, 200, 500, 1000]);
  });

  it("un total que ya es un billete no se repite", () => {
    expect(quickCashAmounts(100)).toEqual([100, 200, 500, 1000]);
  });

  it("un total mayor que todos los billetes solo ofrece el exacto", () => {
    expect(quickCashAmounts(2500)).toEqual([2500]);
  });

  it("nunca ofrece más de 5 atajos", () => {
    expect(quickCashAmounts(10).length).toBeLessThanOrEqual(5);
    expect(MXN_BILL_DENOMINATIONS).toHaveLength(5);
  });
});

describe("summarizePayments (en centavos enteros)", () => {
  it("FE-104: 10 + 1.13 cubre exactamente 11.13 (en flotantes daba 11.129999…)", () => {
    const s = summarizePayments([pay("efectivo", "10", 1), pay("tarjeta", "1.13", 2)], 11.13);
    expect(s.sufficient).toBe(true);
    expect(s.remaining).toBe(0);
    expect(s.paid).toBe(11.13);
  });

  it("falta dinero: remaining positivo, sin cambio, no suficiente", () => {
    const s = summarizePayments([pay("efectivo", "100")], 173.88);
    expect(s.sufficient).toBe(false);
    expect(s.remaining).toBe(73.88);
    expect(s.cashChange).toBe(0);
  });

  it("efectivo de más: calcula el cambio como vista previa", () => {
    const s = summarizePayments([pay("efectivo", "200")], 173.88);
    expect(s.sufficient).toBe(true);
    expect(s.cashChange).toBe(26.12);
  });

  it("sin efectivo no hay cambio aunque sobre dinero", () => {
    const s = summarizePayments([pay("tarjeta", "200")], 173.88);
    expect(s.cashChange).toBe(0);
    expect(s.lastCash).toBeUndefined();
  });

  it("el último pago en efectivo es el que da el cambio", () => {
    const first = pay("efectivo", "50", 1);
    const second = pay("efectivo", "200", 3);
    const s = summarizePayments([first, pay("tarjeta", "10", 2), second], 100);
    expect(s.lastCash).toBe(second);
  });

  it("montos vacíos o inválidos cuentan como 0", () => {
    const s = summarizePayments([pay("efectivo", ""), pay("tarjeta", "abc", 2)], 50);
    expect(s.paid).toBe(0);
    expect(s.sufficient).toBe(false);
  });
});

describe("paymentStatus", () => {
  it("falta por cobrar → tono de error", () => {
    expect(paymentStatus(summarizePayments([pay("efectivo", "10")], 50))).toEqual({ label: "Falta por cobrar", value: 40, tone: "bad" });
  });

  it("con cambio → 'Cambio a entregar'", () => {
    const status = paymentStatus(summarizePayments([pay("efectivo", "100")], 50));
    expect(status).toEqual({ label: "Cambio a entregar", value: 50, tone: "ok" });
  });

  it("pago exacto → 'Cobro completo' sin cambio", () => {
    const status = paymentStatus(summarizePayments([pay("tarjeta", "50")], 50));
    expect(status).toEqual({ label: "Cobro completo", value: 0, tone: "ok" });
  });
});
