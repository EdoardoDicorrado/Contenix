import { parseItalianDate, parseItalianNumber } from "./csv";

export type ColumnRole =
  | "ignore"
  | "date"
  | "description"
  | "amount" // importo unico con segno: + = entrata, − = uscita
  | "debit" // dare (uscita): valore positivo
  | "credit"; // avere (entrata): valore positivo

const PATTERNS: Record<Exclude<ColumnRole, "ignore">, RegExp> = {
  date: /^(data\s*(operazione|valuta|contabile|registrazione)?|date|datum|dt)\b/i,
  description: /^(descri(zione)?|causale|denomin|operazione|details?|note|memo|riferim|beneficiar|note?\s*operaz)/i,
  amount: /^(import[oi]?|amount|valor[ei]?)\b/i,
  debit: /^(dare|addebit|uscit[ae]|debit|out)\b/i,
  credit: /^(avere|accredit|entrat[ae]|credit|in)\b/i,
};

export type ColumnMapping = ColumnRole[];

export function autoDetectMapping(headers: string[]): ColumnMapping {
  return headers.map((h) => {
    const norm = h.trim();
    for (const role of ["date", "description", "amount", "debit", "credit"] as const) {
      if (PATTERNS[role].test(norm)) return role;
    }
    return "ignore";
  });
}

export type TransformedRow =
  | {
      ok: true;
      date: Date;
      amount: number; // sempre positivo
      type: "income" | "expense";
      description: string;
    }
  | { ok: false; error: string; original: string[] };

export function transformRow(row: string[], mapping: ColumnMapping): TransformedRow {
  let date: Date | null = null;
  let description = "";
  let amountSigned: number | null = null;
  let debit: number | null = null;
  let credit: number | null = null;

  for (let i = 0; i < mapping.length; i++) {
    const role = mapping[i];
    const val = (row[i] ?? "").trim();
    if (!val) continue;

    switch (role) {
      case "date":
        date = parseItalianDate(val);
        break;
      case "description":
        description = description ? `${description} — ${val}` : val;
        break;
      case "amount": {
        const n = parseItalianNumber(val);
        if (!isNaN(n)) amountSigned = n;
        break;
      }
      case "debit": {
        const n = parseItalianNumber(val);
        if (!isNaN(n) && n !== 0) debit = Math.abs(n);
        break;
      }
      case "credit": {
        const n = parseItalianNumber(val);
        if (!isNaN(n) && n !== 0) credit = Math.abs(n);
        break;
      }
    }
  }

  if (!date) return { ok: false, error: "Data mancante o non valida", original: row };
  if (!description) return { ok: false, error: "Descrizione mancante", original: row };

  let amount: number;
  let type: "income" | "expense";

  if (credit !== null && credit > 0) {
    amount = credit;
    type = "income";
  } else if (debit !== null && debit > 0) {
    amount = debit;
    type = "expense";
  } else if (amountSigned !== null && !isNaN(amountSigned)) {
    amount = Math.abs(amountSigned);
    type = amountSigned >= 0 ? "income" : "expense";
  } else {
    return { ok: false, error: "Importo mancante o uguale a zero", original: row };
  }

  if (amount === 0) return { ok: false, error: "Importo uguale a zero", original: row };

  return { ok: true, date, amount, type, description };
}

export function transformAll(rows: string[][], mapping: ColumnMapping) {
  const valid: Extract<TransformedRow, { ok: true }>[] = [];
  const errors: Extract<TransformedRow, { ok: false }>[] = [];
  for (const r of rows) {
    if (r.every((c) => !c || !c.trim())) continue; // skip empty rows
    const t = transformRow(r, mapping);
    if (t.ok) valid.push(t);
    else errors.push(t);
  }
  return { valid, errors };
}

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: "Ignora",
  date: "Data",
  description: "Descrizione",
  amount: "Importo (con segno)",
  debit: "Dare (uscita)",
  credit: "Avere (entrata)",
};
