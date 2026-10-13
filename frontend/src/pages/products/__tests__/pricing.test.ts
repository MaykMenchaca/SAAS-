import { describe, expect, it } from "vitest";

import { costCents, formatMargin, marginPct, priceWithTaxCents, profitCents, toCents } from "../pricing";

describe("cálculos de precio de productos", () => {
  it("convierte importes a centavos enteros", () => {
    expect(toCents("12.50")).toBe(1250);
    expect(toCents("0.1")).toBe(10);
    expect(toCents("")).toBe(0);
    expect(toCents("abc")).toBe(0);
    expect(toCents(null)).toBe(0);
  });

  it("usa el costo promedio y, si es cero, el último costo de compra", () => {
    expect(costCents("50.0000", "40.00")).toBe(5000);
    expect(costCents("0.0000", "40.00")).toBe(4000);
    expect(costCents(undefined, undefined)).toBe(0);
  });

  it("calcula precio con IVA y utilidad", () => {
    expect(priceWithTaxCents(10000, "16.00")).toBe(11600);
    expect(priceWithTaxCents(10000, "")).toBe(10000);
    expect(profitCents(10000, 5000)).toBe(5000);
  });

  it("calcula el margen sobre el precio y maneja precio cero", () => {
    expect(marginPct(10000, 5000)).toBe(50);
    expect(marginPct(0, 5000)).toBeNull();
    expect(formatMargin(33.333)).toBe("33.3 %");
    expect(formatMargin(null)).toBe("—");
  });
});
