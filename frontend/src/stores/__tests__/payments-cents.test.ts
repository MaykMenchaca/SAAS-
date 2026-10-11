import { describe, expect, it } from "vitest";

import { sumPaymentsCents, toCents } from "../pos-store";

describe("pagos en centavos (FE-104)", () => {
  it("el pago dividido exacto cubre el total", () => {
    // En flotantes: 10 + 1.13 = 11.129999999999999 < 11.13 → "Completar cobro" quedaba deshabilitado
    expect(10 + 1.13).toBeLessThan(11.13);
    expect(sumPaymentsCents([{ amount: "10" }, { amount: "1.13" }])).toBe(toCents(11.13));
  });

  it("ignora importes vacíos o inválidos", () => {
    expect(sumPaymentsCents([{ amount: "" }, { amount: "abc" }, { amount: 0.1 }, { amount: "0.2" }])).toBe(30);
  });
});
