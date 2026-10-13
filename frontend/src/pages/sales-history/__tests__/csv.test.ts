import { describe, expect, it } from "vitest";

import type { SaleListItem } from "../../../api/sales";
import { CSV_BOM, csvEscape, localDateTime, methodsLabel, salesToCsv } from "../csv";

const sale = (over: Partial<SaleListItem> = {}): SaleListItem => ({
  id: 1,
  folio: "V-20261012-0001",
  total: "116.00",
  status: "completada",
  created_at: "2026-10-12T20:05:00Z",
  username: "jperez",
  items_count: "3.000",
  payment_methods: ["efectivo"],
  ...over,
});

describe("csvEscape", () => {
  it("deja intacto el texto simple", () => expect(csvEscape("hola")).toBe("hola"));
  it("entrecomilla comas", () => expect(csvEscape("a,b")).toBe('"a,b"'));
  it("duplica las comillas", () => expect(csvEscape('di "hola"')).toBe('"di ""hola"""'));
  it("entrecomilla saltos de línea", () => expect(csvEscape("a\nb")).toBe('"a\nb"'));
  it("vacío para null y undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("salesToCsv", () => {
  it("empieza con BOM UTF-8 y encabezados en español", () => {
    const csv = salesToCsv([]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}Folio,Fecha,Cajero,Artículos,Método de pago,Total,Estado\r\n`);
  });

  it("una fila por venta con fecha local, artículos sin ceros y estado legible", () => {
    const d = new Date("2026-10-12T20:05:00Z");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lines = salesToCsv([sale(), sale({ folio: "V-2", status: "devolucion_parcial", payment_methods: ["efectivo", "tarjeta"], items_count: "1.500" })]).split("\r\n");
    expect(lines[1]).toBe(`V-20261012-0001,${dia} ${hh}:${mm},jperez,3,Efectivo,116.00,Completada`);
    expect(lines[2]).toBe(`V-2,${dia} ${hh}:${mm},jperez,1.5,Efectivo + Tarjeta,116.00,Devolución parcial`);
  });

  it("escapa un cajero con coma y comillas", () => {
    const csv = salesToCsv([sale({ username: 'Pérez, "Jorge"' })]);
    expect(csv).toContain('"Pérez, ""Jorge"""');
  });

  it("localDateTime devuelve el texto original si la fecha es inválida", () => {
    expect(localDateTime("no-es-fecha")).toBe("no-es-fecha");
  });

  it("methodsLabel", () => {
    expect(methodsLabel(undefined)).toBe("");
    expect(methodsLabel(["transferencia"])).toBe("Transferencia");
  });
});
