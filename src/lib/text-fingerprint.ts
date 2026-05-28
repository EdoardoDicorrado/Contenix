/**
 * Utility condivise per la normalizzazione di descrizioni movimenti bancari
 * e altre stringhe testuali. Centralizza qui per evitare duplicati nelle
 * varie pagine (movimenti, da-rivedere, dashboard, sincronizza, ecc.).
 */

/**
 * Token "rumore" da ignorare quando si estraggono parole significative
 * dalle descrizioni dei movimenti bancari.
 */
export const BANKING_NOISE_TOKENS = new Set([
  "bonifico", "pagamento", "incasso", "addebito", "accredito", "versamento",
  "sepa", "fatt", "fattura", "del", "al", "da", "in", "per", "via", "c/o",
  "spese", "commissioni", "sdd", "carta", "estratto", "conto", "saldo",
  "rid", "n", "nr", "ord", "ben", "beneficiario", "ordinante", "rif",
  "cro", "iur", "trn", "id", "cod", "codice", "data", "valuta", "dare",
  "avere", "uscita", "entrata", "movimento", "credito", "debito", "cliente",
  "fornitore", "italia", "italy", "spa", "srl", "sas", "snc",
  "dt", "acq", "pos", "merchant", "voi", "vostro", "favore", "disposto",
  "istantaneo", "europea", "europe", "limited",
  "effettuato", "ore", "mediante", "presso", "ctv", "usd", "eur", "cambio",
  "commissione", "conversione", "valutaria", "applicata", "operazione",
  "autorizzazione", "ora", "alle", "intern", "inter", "notprovided", "cash",
]);

/**
 * Normalizza una stringa: lowercase + rimozione accenti (NFD) + spazi
 * collassati. Mantiene punteggiatura specifica (`.`, `/`, `@`, `-`).
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s./@-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Versione "semplice" della normalizzazione: lowercase + rimozione di
 * tutto ciò che non è alfanumerico + spazi collassati. Usata per match
 * di nomi (categorie, dipendenti) dove la punteggiatura non serve.
 */
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type FingerprintOptions = {
  /** Numero massimo di token da concatenare nel fingerprint (default 2). */
  maxTokens?: number;
  /** Set di noise da escludere (default BANKING_NOISE_TOKENS). */
  noise?: Set<string>;
};

/**
 * Estrae i primi N token "significativi" da una descrizione bancaria.
 * Esclude noise comuni e numeri/codici, restituendo una chiave breve
 * adatta a raggruppare descrizioni simili.
 *
 * Esempio:
 *   fingerprint("BONIFICO ISTANTANEO ... GRENKE LOCAZIONE SRL ...")
 *     → "grenke locazione"
 */
export function fingerprint(text: string, options: FingerprintOptions = {}): string {
  if (!text) return "";
  const maxTokens = options.maxTokens ?? 2;
  const noise = options.noise ?? BANKING_NOISE_TOKENS;

  const cleaned = normalizeText(text);
  const tokens = cleaned
    .split(/[\s./]+/)
    .filter((t) => {
      if (t.length < 3) return false;
      if (/^\d/.test(t)) return false; // numeri o stringhe che iniziano con cifra
      if (/^x+$/.test(t)) return false; // mascheramenti tipo "xxxx"
      if (noise.has(t)) return false;
      return true;
    });
  return tokens.slice(0, maxTokens).join(" ");
}
