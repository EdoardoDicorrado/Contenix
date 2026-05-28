/**
 * Genera CSV per export verso il commercialista.
 *
 * Convenzioni italiane:
 * - Separatore `;` (default Excel italiano)
 * - Decimale `,` (formato italiano)
 * - BOM UTF-8 iniziale (per fare aprire correttamente Excel italiano)
 * - Quoting standard RFC 4180 con `"`
 */

export type CsvRow = (string | number | null | undefined)[];

const BOM = "﻿";

function quote(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? formatNumber(value) : String(value);
  // Quota se contiene separatore, virgolette, newline
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatNumber(n: number): string {
  // 1234.56 → "1234,56" (formato italiano per Excel italiano)
  return n.toFixed(2).replace(".", ",");
}

export function buildCsv(headers: string[], rows: CsvRow[]): string {
  const lines: string[] = [];
  lines.push(headers.map(quote).join(";"));
  for (const row of rows) {
    lines.push(row.map(quote).join(";"));
  }
  return BOM + lines.join("\r\n");
}

export function formatDateIt(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
