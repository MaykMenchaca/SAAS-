/**
 * CSV de los reportes: funciones puras (sin DOM) salvo `downloadCsv`.
 * Escapa comas, comillas y saltos de línea; antepone BOM UTF-8 para que Excel respete los acentos.
 */

export type CsvCell = string | number | null | undefined;

const BOM = "﻿";

/** Un campo CSV: entre comillas si lleva coma, comilla, salto de línea o espacios en los extremos. */
export function escapeCsvField(value: CsvCell): string {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Texto libre (nombres, SKU) a salvo de fórmulas: Excel ejecuta lo que empieza con = + - @.
 * No usar con números, que pueden ser negativos legítimos.
 */
export function safeText(value: string | null | undefined): string {
  const text = value ?? "";
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Contenido completo del archivo: BOM + encabezados + filas, separados por CRLF. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Nombre de archivo seguro: `ventas_2026-10-01_2026-10-12.csv`. */
export function csvFilename(base: string, from?: string, to?: string): string {
  const parts = [base, from, to].filter(Boolean) as string[];
  return `${parts.join("_").replace(/[^\w.-]+/g, "_")}.csv`;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const blob = new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
