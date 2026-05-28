import { parseItalianDate, parseItalianNumber } from "./csv";
import type { ImportPlan } from "./excel-ai-detector";

export type AppliedRow =
  | {
      ok: true;
      sourceRowIndex: number;
      date: Date;
      amount: number; // sempre positivo
      type: "income" | "expense";
      description: string;
      currency: string;
    }
  | {
      ok: false;
      sourceRowIndex: number;
      error: string;
      raw: string[];
    };

export type ApplyPlanResult = {
  valid: Extract<AppliedRow, { ok: true }>[];
  errors: Extract<AppliedRow, { ok: false }>[];
  filtered: number; // numero di righe escluse dai filtri
};

function getCell(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return null;
  return row[idx];
}

function cellAsString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const dd = String(value.getUTCDate()).padStart(2, "0");
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = value.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return String(value).trim();
}

function cellAsNumber(value: unknown): number {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  return parseItalianNumber(String(value));
}

function cellAsDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    // Normalizza Date al UTC (rimuovi ora se presente)
    const d = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    return isNaN(d.getTime()) ? null : d;
  }
  return parseItalianDate(String(value));
}

function passesFilter(row: unknown[], filter: ImportPlan["filters"][number]): boolean {
  const cellRaw = getCell(row, filter.columnIndex);
  const cell = cellAsString(cellRaw);
  const value = filter.value ?? "";

  switch (filter.operator) {
    case "equals":
      return cell.toLowerCase().trim() === value.toLowerCase().trim();
    case "not_equals":
      return cell.toLowerCase().trim() !== value.toLowerCase().trim();
    case "contains":
      return cell.toLowerCase().includes(value.toLowerCase());
    case "not_contains":
      return !cell.toLowerCase().includes(value.toLowerCase());
    case "is_empty":
      return cell.length === 0;
    case "is_not_empty":
      return cell.length > 0;
  }
}

export function applyImportPlan(rows: unknown[][], plan: ImportPlan): ApplyPlanResult {
  const valid: Extract<AppliedRow, { ok: true }>[] = [];
  const errors: Extract<AppliedRow, { ok: false }>[] = [];
  let filtered = 0;

  for (let i = plan.firstDataRowIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Skip righe completamente vuote
    if (row.every((c) => c == null || cellAsString(c) === "")) continue;

    // I filtri descrivono righe da ESCLUDERE.
    // Una riga viene esclusa se ALMENO UN filtro matcha la sua condizione.
    const shouldExclude = plan.filters.some((f) => passesFilter(row, f));
    if (shouldExclude) {
      filtered++;
      continue;
    }

    const rawAsString = row.map((c) => cellAsString(c));

    // Parsing date
    const date = cellAsDate(getCell(row, plan.columnMapping.date));
    if (!date) {
      errors.push({
        ok: false,
        sourceRowIndex: i,
        error: `Data non valida o mancante (colonna c${plan.columnMapping.date})`,
        raw: rawAsString,
      });
      continue;
    }

    // Parsing descrizione (concatena colonne)
    const descParts = plan.columnMapping.description
      .map((idx) => cellAsString(getCell(row, idx)))
      .filter((s) => s.length > 0);
    if (descParts.length === 0) {
      errors.push({
        ok: false,
        sourceRowIndex: i,
        error: "Descrizione vuota",
        raw: rawAsString,
      });
      continue;
    }
    const description = descParts.join(" — ");

    // Parsing importo
    let signedAmount: number;
    if (plan.columnMapping.amount != null) {
      signedAmount = cellAsNumber(getCell(row, plan.columnMapping.amount));
    } else if (
      plan.columnMapping.debit != null &&
      plan.columnMapping.credit != null
    ) {
      const debit = cellAsNumber(getCell(row, plan.columnMapping.debit));
      const credit = cellAsNumber(getCell(row, plan.columnMapping.credit));
      // Le colonne Dare/Avere possono contenere valori con qualsiasi segno
      // (alcune banche scrivono gli addebiti come negativi, altre come positivi)
      // Determiniamo la natura del movimento dalla COLONNA, non dal segno del valore.
      const hasCredit = !isNaN(credit) && credit !== 0;
      const hasDebit = !isNaN(debit) && debit !== 0;
      if (hasCredit) {
        signedAmount = Math.abs(credit); // sempre entrata, valore positivo
      } else if (hasDebit) {
        signedAmount = -Math.abs(debit); // sempre uscita, valore negativo
      } else {
        errors.push({
          ok: false,
          sourceRowIndex: i,
          error: "Importi Dare/Avere entrambi vuoti o zero",
          raw: rawAsString,
        });
        continue;
      }
    } else {
      errors.push({
        ok: false,
        sourceRowIndex: i,
        error: "Mapping importo non disponibile (né amount né debit/credit)",
        raw: rawAsString,
      });
      continue;
    }

    if (isNaN(signedAmount) || signedAmount === 0) {
      errors.push({
        ok: false,
        sourceRowIndex: i,
        error: "Importo non parsabile o zero",
        raw: rawAsString,
      });
      continue;
    }

    const amount = Math.abs(signedAmount);
    const type: "income" | "expense" = signedAmount >= 0 ? "income" : "expense";

    // Valuta
    const currency = plan.columnMapping.currency != null
      ? cellAsString(getCell(row, plan.columnMapping.currency)).toUpperCase() || "EUR"
      : "EUR";

    valid.push({
      ok: true,
      sourceRowIndex: i,
      date,
      amount,
      type,
      description: description.length > 500 ? description.slice(0, 497) + "..." : description,
      currency,
    });
  }

  return { valid, errors, filtered };
}
