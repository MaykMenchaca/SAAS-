import { describe, expect, it } from "vitest";

import { estimateLineCents, parseQty, qtyError, qtyText } from "../refund";

describe("estimateLineCents", () => {
  const item = { subtotal: "200.00", quantity: "2.000", tax_rate: "16.00" };

  it("una pieza de dos: mitad del subtotal más IVA", () => {
    expect(estimateLineCents(item, 1)).toEqual({ subCents: 10000, taxCents: 1600, totalCents: 11600 });
  });

  it("cantidades fraccionarias", () => {
    const metros = { subtotal: "19.48", quantity: "1.500", tax_rate: "16.00" };
    expect(estimateLineCents(metros, 0.5).subCents).toBe(649);
  });

  it("cero para cantidades no positivas", () => {
    expect(estimateLineCents(item, 0).totalCents).toBe(0);
    expect(estimateLineCents(item, -1).totalCents).toBe(0);
  });
});

describe("qtyError", () => {
  it("vacía o cero", () => {
    expect(qtyError("", 3, false)).toMatch(/mayor a 0/);
    expect(qtyError("0", 3, false)).toMatch(/mayor a 0/);
  });
  it("más de lo disponible", () => expect(qtyError("4", 3, false)).toBe("Máximo 3."));
  it("fracción en unidad entera", () => expect(qtyError("1.5", 3, false)).toMatch(/enteras/));
  it("fracción permitida", () => expect(qtyError("1.5", 3, true)).toBe(""));
  it("válida", () => expect(qtyError("2", 3, false)).toBe(""));
});

describe("helpers de texto", () => {
  it("qtyText quita ceros", () => expect(qtyText(1.5)).toBe("1.5"));
  it("parseQty", () => {
    expect(parseQty("2")).toBe(2);
    expect(Number.isNaN(parseQty(" "))).toBe(true);
  });
});
