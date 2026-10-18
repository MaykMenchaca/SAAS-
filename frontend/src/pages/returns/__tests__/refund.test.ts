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

  // RF-49: el servidor redondea al par (HALF_EVEN); la pantalla mostró $44.81 y se reembolsaron $44.80
  it("redondea las mitades al par como el servidor (D-20261017-0003)", () => {
    const cinta = { subtotal: "18.00", quantity: "1.000", tax_rate: "16.00" };
    const cable = { subtotal: "41.25", quantity: "2.500", tax_rate: "16.00" };
    // 47.85 × 1.25 / 2.5 = 23.925 → 23.92
    expect(estimateLineCents(cable, 1.25)).toEqual({ subCents: 2062, taxCents: 330, totalCents: 2392 });
    expect(estimateLineCents(cinta, 1).totalCents + estimateLineCents(cable, 1.25).totalCents).toBe(4480);
  });

  // RF-49: reembolso ACUMULADO por partida, igual que _refund_upto del servidor (RF-04)
  it("descuenta lo ya devuelto: 3 devoluciones de 1 de una partida de $3.65 suman $3.65", () => {
    const base = { subtotal: "3.15", quantity: "3.000", tax_rate: "16.00" };
    const first = estimateLineCents({ ...base, returned_quantity: "0.000" }, 1).totalCents;
    const second = estimateLineCents({ ...base, returned_quantity: "1.000" }, 1).totalCents;
    const third = estimateLineCents({ ...base, returned_quantity: "2.000" }, 1).totalCents;
    expect([first, second, third]).toEqual([122, 121, 122]);
    expect(first + second + third).toBe(365);
  });

  it("devolver el resto de la partida da exactamente lo que falta por reembolsar", () => {
    const cable = { subtotal: "41.25", quantity: "2.500", tax_rate: "16.00", returned_quantity: "1.250" };
    expect(estimateLineCents(cable, 1.25)).toEqual({ subCents: 2063, taxCents: 330, totalCents: 2393 });
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
