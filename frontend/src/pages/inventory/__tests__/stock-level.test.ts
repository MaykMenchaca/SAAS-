import { describe, expect, it } from "vitest";

import { countFolio, formatDelta, isBelowMin, levelBar, quantityDelta, stockLevel } from "../stock-level";

describe("nivel de stock", () => {
  it("clasifica agotado, bajo y normal", () => {
    expect(stockLevel(0, 5)).toBe("agotado");
    expect(stockLevel(3, 5)).toBe("bajo");
    expect(stockLevel(5, 5)).toBe("normal");
    expect(stockLevel(2, 0)).toBe("normal");
  });

  it("sin mínimo definido nunca está bajo el mínimo", () => {
    expect(isBelowMin(1, 0)).toBe(false);
    expect(isBelowMin(1, 2)).toBe(true);
  });

  it("calcula la barra con y sin máximo", () => {
    expect(levelBar(20, 10, 40)).toEqual({ fill: 50, minMark: 25 });
    expect(levelBar(100, 10, 40).fill).toBe(100);
    expect(levelBar(5, 10, 0)).toEqual({ fill: 25, minMark: 50 });
    expect(levelBar(0, 0, 0)).toEqual({ fill: 0, minMark: null });
  });

  it("calcula la diferencia con decimales sin errores de punto flotante", () => {
    expect(quantityDelta("0.3", "0.1")).toBe(0.2);
    expect(quantityDelta("", "5")).toBeNull();
    expect(formatDelta(3)).toBe("+3");
    expect(formatDelta(-2)).toBe("-2");
  });

  it("da formato al folio del conteo", () => {
    expect(countFolio(8)).toBe("CF-0008");
    expect(countFolio(12345)).toBe("CF-12345");
  });
});
