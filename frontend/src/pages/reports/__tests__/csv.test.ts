import { describe, expect, it } from "vitest";

import { buildCsv, csvFilename, escapeCsvField, safeText } from "../csv";
import { averageTicket, fillMissingDays, matchPreset, presetRange, shares, validateRange } from "../helpers";

describe("CSV de reportes", () => {
  it("escapa comas, comillas y saltos de línea", () => {
    expect(escapeCsvField("Tornillo 6x1, caja")).toBe('"Tornillo 6x1, caja"');
    expect(escapeCsvField('Llave perica 10"')).toBe('"Llave perica 10"""');
    expect(escapeCsvField("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
    expect(escapeCsvField("simple")).toBe("simple");
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(12.5)).toBe("12.5");
  });

  it("antepone BOM UTF-8, separa con CRLF y conserva los acentos", () => {
    const csv = buildCsv(["Producto", "Ingreso"], [["Cinta de aislar, negra", "1,000.00"], ["Pintura vinílica", "5"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Producto,Ingreso\r\n"Cinta de aislar, negra","1,000.00"\r\nPintura vinílica,5\r\n');
  });

  it("neutraliza fórmulas en texto libre pero no en números negativos", () => {
    expect(safeText("=SUMA(A1)")).toBe("'=SUMA(A1)");
    expect(safeText("@cmd")).toBe("'@cmd");
    expect(safeText("Martillo")).toBe("Martillo");
    expect(escapeCsvField("-5.00")).toBe("-5.00");
  });

  it("arma el nombre del archivo con el rango", () => {
    expect(csvFilename("ventas", "2026-10-01", "2026-10-12")).toBe("ventas_2026-10-01_2026-10-12.csv");
    expect(csvFilename("valuacion_inventario")).toBe("valuacion_inventario.csv");
  });
});

describe("Ayudas de reportes", () => {
  it("valida que Desde no sea posterior a Hasta", () => {
    expect(validateRange("2026-10-12", "2026-10-01")).toBe("La fecha inicial debe ser anterior o igual a la final.");
    expect(validateRange("2026-10-01", "2026-10-01")).toBe("");
    expect(validateRange("", "2026-10-01")).toBe("");
  });

  it("calcula los atajos de rango y los reconoce", () => {
    const hoy = new Date(2026, 9, 12);
    expect(presetRange("7", hoy)).toEqual({ from: "2026-10-06", to: "2026-10-12" });
    expect(presetRange("month", hoy)).toEqual({ from: "2026-10-01", to: "2026-10-12" });
    expect(presetRange("year", hoy)).toEqual({ from: "2026-01-01", to: "2026-10-12" });
    expect(matchPreset("2026-10-06", "2026-10-12", hoy)).toBe("7");
    expect(matchPreset("2026-10-02", "2026-10-12", hoy)).toBeNull();
  });

  it("rellena con ceros los días sin ventas", () => {
    const filled = fillMissingDays([{ date: "2026-10-02", count: 3, revenue: "30.00" }], "2026-10-01", "2026-10-03");
    expect(filled.map((d) => [d.date, d.count, d.revenue])).toEqual([
      ["2026-10-01", 0, "0.00"],
      ["2026-10-02", 3, "30.00"],
      ["2026-10-03", 0, "0.00"],
    ]);
  });

  it("calcula participaciones que suman 100 y tolera total cero", () => {
    const p = shares([50, 30, 20]);
    expect(p).toEqual([50, 30, 20]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });

  it("ticket promedio sin ventas es cero", () => {
    expect(averageTicket("1000.00", 4)).toBe(250);
    expect(averageTicket("0", 0)).toBe(0);
  });
});
