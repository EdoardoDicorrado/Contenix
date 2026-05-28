/**
 * Raggruppamento di movimenti per pattern simile.
 *
 * Idea: per file con 500-1500 righe, gli stessi 10-20 vendor ricorrono molte volte.
 * Estraiamo un "fingerprint" della descrizione (primi 2 token significativi al
 * netto del rumore bancario) e raggruppiamo per quella stringa.
 *
 * Esempio: 12 movimenti "POSTMARKAPP.COM - DT.ACQ.: ..." → 1 gruppo "postmarkapp com"
 * con 12 righe → l'utente categorizza una volta e applica a tutti.
 */

export type ValidRowForGrouping = {
  sourceRowIndex: number;
  date: string;
  amount: number;
  type: "income" | "expense";
  description: string;
  currency: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedFromRule: boolean;
};

export type MovementGroup = {
  pattern: string; // fingerprint visibile all'utente
  rows: ValidRowForGrouping[];
  totalIncome: number;
  totalExpense: number;
  /** Categoria suggerita = quella che matcha la maggior parte delle righe del gruppo. */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  /** true se la suggested viene da una regola esistente */
  fromRule: boolean;
};

import { fingerprint } from "./text-fingerprint";

export function groupMovements(
  rows: ValidRowForGrouping[],
  options: { minGroupSize?: number } = {},
): { groups: MovementGroup[]; singletons: ValidRowForGrouping[] } {
  const minGroupSize = options.minGroupSize ?? 2;

  const map = new Map<string, ValidRowForGrouping[]>();
  for (const r of rows) {
    const key = fingerprint(r.description);
    if (!key) {
      // Riga senza pattern utile → singleton
      continue;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const groups: MovementGroup[] = [];
  const singletons: ValidRowForGrouping[] = [];

  for (const [pattern, rs] of map) {
    if (rs.length < minGroupSize) {
      singletons.push(...rs);
      continue;
    }

    // Determina suggestedCategoryId = quella più frequente tra le suggested
    const counts = new Map<string, { count: number; name: string | null; fromRule: boolean }>();
    for (const r of rs) {
      if (r.suggestedCategoryId) {
        const entry = counts.get(r.suggestedCategoryId) ?? {
          count: 0,
          name: r.suggestedCategoryName,
          fromRule: r.suggestedFromRule,
        };
        entry.count += 1;
        if (r.suggestedFromRule) entry.fromRule = true;
        counts.set(r.suggestedCategoryId, entry);
      }
    }

    let suggestedId: string | null = null;
    let suggestedName: string | null = null;
    let suggestedFromRule = false;
    let maxCount = 0;
    for (const [id, entry] of counts) {
      if (entry.count > maxCount) {
        maxCount = entry.count;
        suggestedId = id;
        suggestedName = entry.name;
        suggestedFromRule = entry.fromRule;
      }
    }

    groups.push({
      pattern,
      rows: rs,
      totalIncome: rs.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0),
      totalExpense: rs.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0),
      suggestedCategoryId: suggestedId,
      suggestedCategoryName: suggestedName,
      fromRule: suggestedFromRule,
    });
  }

  // Aggiungi anche righe orfane (pattern vuoto, non grouppabili)
  for (const r of rows) {
    const key = fingerprint(r.description);
    if (!key) singletons.push(r);
  }

  // Ordina: gruppi più grandi prima
  groups.sort((a, b) => b.rows.length - a.rows.length);
  // Singletons ordinate per data desc
  singletons.sort((a, b) => (a.date < b.date ? 1 : -1));

  return { groups, singletons };
}
