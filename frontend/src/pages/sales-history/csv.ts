import type { SaleListItem } from "../../api/sales";
import { saleStatusMeta } from "../../api/sales";
import { localISODate } from "../../lib/dates";

/** Marca de orden de bytes UTF-8: Excel la necesita para leer bien los acentos. */
export const CSV_BOM = "﻿";

/** Escapa un valor para CSV: lo entrecomilla si trae comas, comillas o saltos de línea. */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(",");
}

/** Fecha y hora en la zona horaria local del navegador: AAAA-MM-DD HH:mm. */
export function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${localISODate(d)} ${hh}:${mm}`;
}

const METHOD_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };

export function methodsLabel(methods: string[] | undefined): string {
  if (!methods || methods.length === 0) return "";
  return methods.map((m) => METHOD_LABEL[m] ?? m).join(" + ");
}

/** CSV del historial de ventas (con BOM, saltos CRLF y fechas locales). */
export function salesToCsv(sales: SaleListItem[]): string {
  const header = csvLine(["Folio", "Fecha", "Cajero", "Artículos", "Método de pago", "Total", "Estado"]);
  const lines = sales.map((sale) =>
    csvLine([
      sale.folio,
      localDateTime(sale.created_at),
      sale.username,
      sale.items_count == null ? "" : String(parseFloat(sale.items_count)),
      methodsLabel(sale.payment_methods),
      sale.total,
      saleStatusMeta(sale.status).label,
    ]),
  );
  return CSV_BOM + [header, ...lines].join("\r\n") + "\r\n";
}

/** Descarga un texto como archivo en el navegador. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
