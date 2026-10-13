import { describe, expect, it } from "vitest";

import { clampDiscount, customDiscountText, DISCOUNT_PRESETS, formatQty, FRACTION_QUICK, qtyStep, roundQty, sanitizeQtyInput } from "../cart-helpers";

describe("cantidades", () => {
  it("el paso es 0.5 para fraccionables y 1 para piezas", () => {
    expect(qtyStep(true)).toBe(0.5);
    expect(qtyStep(false)).toBe(1);
  });

  it("formatQty quita ceros sobrantes", () => {
    expect(formatQty(2, false)).toBe("2");
    expect(formatQty(12.5, true)).toBe("12.5");
    expect(formatQty(0.25, true)).toBe("0.25");
    expect(formatQty(1.5, true)).toBe("1.5");
  });

  it("una pieza no muestra decimales", () => {
    expect(formatQty(3.4, false)).toBe("3");
  });

  it("sanitizeQtyInput: coma → punto y solo caracteres válidos", () => {
    expect(sanitizeQtyInput("1,5", true)).toBe("1.5");
    expect(sanitizeQtyInput("a2b", true)).toBe("2");
    expect(sanitizeQtyInput("1.5", false)).toBe("15"); // las piezas no admiten punto
  });

  it("sanitizeQtyInput deja un solo punto decimal", () => {
    expect(sanitizeQtyInput("1.2.3", true)).toBe("1.23");
  });

  it("roundQty limita a 3 decimales (como el servidor)", () => {
    expect(roundQty(0.30000000000000004)).toBe(0.3);
    expect(roundQty(1.23456)).toBe(1.235);
  });

  it("hay 6 atajos de cantidad fraccionaria", () => {
    expect([...FRACTION_QUICK]).toEqual([0.25, 0.5, 1, 2.5, 5, 10]);
  });
});

describe("descuentos", () => {
  it("clampDiscount acota entre 0 y 100", () => {
    expect(clampDiscount(-5)).toBe(0);
    expect(clampDiscount(150)).toBe(100);
    expect(clampDiscount(12.5)).toBe(12.5);
    expect(clampDiscount(Number.NaN)).toBe(0);
  });

  it("redondea a 2 decimales", () => {
    expect(clampDiscount(12.3456)).toBe(12.35);
  });

  it("los predefinidos son Sin, 5, 10, 15 y 20", () => {
    expect([...DISCOUNT_PRESETS]).toEqual([0, 5, 10, 15, 20]);
  });

  it("el campo 'Otro' queda vacío si el descuento es un predefinido", () => {
    expect(customDiscountText(10)).toBe("");
    expect(customDiscountText(0)).toBe("");
    expect(customDiscountText(7.5)).toBe("7.5");
  });
});
