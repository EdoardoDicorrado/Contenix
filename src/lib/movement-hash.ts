import { createHash } from "node:crypto";

/**
 * Hash deterministico di un movimento bancario per dedup automatica al re-import.
 *
 * Strategia "counter posizionale": l'hash è SHA-256 di
 *  account_id + date(YYYY-MM-DD) + amount + type + description_normalizzata
 *  + ":" + occurrenceIndex
 *
 * `occurrenceIndex` è l'ordinale del movimento all'interno di una serie di
 * doppioni identici (stesso giorno, stesso importo, stessa descrizione).
 * Il PRIMO movimento di una serie ha index=0, il secondo 1, ecc. Così:
 *  - 2 caffè identici lo stesso giorno → due righe distinte nel DB (index 0, 1)
 *  - Re-import dello stesso CSV nello stesso ordine → stessi hash → skip
 *
 * Per l'import in batch, il chiamante mantiene un contatore "seenInBatch"
 * per signature e lo passa qui. Per createMovement standalone (singolo
 * insert dalla UI), il chiamante può lasciare 0 oppure conteggiare i
 * movimenti gemelli già esistenti.
 */
export function computeMovementHash(opts: {
  accountId: string | null;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  occurrenceIndex: number;
}): string {
  const dateStr = opts.date.toISOString().slice(0, 10); // YYYY-MM-DD, ignora ora
  const normDesc = normalizeForHash(opts.description);
  const accountKey = opts.accountId ?? "no-account";
  const payload = [
    accountKey,
    dateStr,
    opts.amount,
    opts.type,
    normDesc,
    `:${opts.occurrenceIndex}`,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Normalizza la descrizione per il hashing: lowercase + squish spazi + trim.
 * Volutamente conservativa: non rimuoviamo nulla (la pulizia è altrove,
 * in description_clean). Qui vogliamo che lo stesso "fatto bancario" produca
 * lo stesso hash anche se la banca aggiunge/rimuove spazi.
 */
function normalizeForHash(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Calcola "signature base" senza occurrenceIndex. Usato dal batch importer
 * per raggruppare le righe con la stessa identità prima di assegnare gli
 * index 0, 1, 2…
 */
export function movementSignature(opts: {
  accountId: string | null;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
}): string {
  const dateStr = opts.date.toISOString().slice(0, 10);
  const normDesc = normalizeForHash(opts.description);
  const accountKey = opts.accountId ?? "no-account";
  return `${accountKey}|${dateStr}|${opts.amount}|${opts.type}|${normDesc}`;
}
