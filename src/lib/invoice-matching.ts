/**
 * Algoritmo deterministico per il matching fattura ↔ movimento bancario.
 * Score 0–100. Soglie suggerite:
 *   - >= 90  → match certo (auto-link sicuro)
 *   - >= 70  → match probabile (suggerito)
 *   - >= 50  → candidato debole
 *   - <  50  → ignora
 *
 * I pesi si basano su euristica concreta: importo identico è il segnale più forte,
 * data vicina secondo, controparte nel testo terzo, direzione coerente quarto.
 */

const W_AMOUNT_EXACT = 50;
const W_AMOUNT_VERY_CLOSE = 35; // entro 1% (commissioni bancarie)
const W_AMOUNT_CLOSE = 18; // entro 5%

const W_DATE_SAME = 25;
const W_DATE_WITHIN_3D = 20;
const W_DATE_WITHIN_7D = 14;
const W_DATE_WITHIN_30D = 6;

const W_COUNTERPARTY_FULL = 18;
const W_COUNTERPARTY_PARTIAL = 12;
const W_COUNTERPARTY_TOKEN = 6;
/** Match fuzzy del nome: typo bancari, OCR sbagliati. */
const W_COUNTERPARTY_NEAR = 8;

const W_DIRECTION_OK = 7;
const W_DIRECTION_WRONG = -40;

const NUMBER_HINT_BONUS = 6;

/** IBAN della fattura presente nella descrizione → segnale forte di pagamento. */
const W_IBAN_MATCH = 25;
/** P.IVA controparte presente nella descrizione → bonifici SEPA, SDD. */
const W_VAT_MATCH = 25;
/** Alias appreso da match passati: max 30 (configurabile per riga). */
const W_ALIAS_MAX = 30;

export type AliasHint = {
  pattern: string;
  boost: number;
};

export type InvoiceForMatch = {
  id: string;
  number: string;
  type: "purchase" | "sale";
  counterpartyName: string;
  issueDate: Date;
  totalAmount: string;
  /** IBAN beneficiario, se noto. Usato per match diretto via descrizione movimento. */
  paymentIban?: string | null;
  /** P.IVA controparte (con o senza prefisso ISO). Usata per match nella descrizione. */
  counterpartyVat?: string | null;
};

export type MovementForMatch = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
};

export type MatchScore = {
  score: number;
  reasons: string[];
  expectedDirection: "income" | "expense";
  directionOk: boolean;
};

export function scoreMatch(
  invoice: InvoiceForMatch,
  movement: MovementForMatch,
  aliases: AliasHint[] = [],
): MatchScore {
  const reasons: string[] = [];
  let score = 0;

  const invAmount = parseFloat(invoice.totalAmount);
  const movAmount = parseFloat(movement.amount);
  const diff = Math.abs(invAmount - movAmount);
  const relDiff = invAmount > 0 ? diff / invAmount : 1;

  if (diff < 0.01) {
    score += W_AMOUNT_EXACT;
    reasons.push("Importo identico");
  } else if (relDiff <= 0.01) {
    score += W_AMOUNT_VERY_CLOSE;
    reasons.push("Importo entro 1% (poss. commissioni)");
  } else if (relDiff <= 0.05) {
    score += W_AMOUNT_CLOSE;
    reasons.push("Importo entro 5%");
  }

  const dDays = daysBetween(invoice.issueDate, movement.date);
  if (dDays === 0) {
    score += W_DATE_SAME;
    reasons.push("Stessa data");
  } else if (dDays <= 3) {
    score += W_DATE_WITHIN_3D;
    reasons.push(`Data entro 3 giorni (${dDays}g)`);
  } else if (dDays <= 7) {
    score += W_DATE_WITHIN_7D;
    reasons.push(`Data entro 7 giorni (${dDays}g)`);
  } else if (dDays <= 30) {
    score += W_DATE_WITHIN_30D;
    reasons.push(`Data entro 30 giorni (${dDays}g)`);
  }

  const cpScore = counterpartyMatchScore(invoice.counterpartyName, movement.description);
  if (cpScore.kind === "full") {
    score += W_COUNTERPARTY_FULL;
    reasons.push(`Controparte presente: "${cpScore.matched}"`);
  } else if (cpScore.kind === "partial") {
    score += W_COUNTERPARTY_PARTIAL;
    reasons.push(`Controparte parziale: "${cpScore.matched}"`);
  } else if (cpScore.kind === "token") {
    score += W_COUNTERPARTY_TOKEN;
    reasons.push("Token controparte presente");
  } else if (cpScore.kind === "near") {
    score += W_COUNTERPARTY_NEAR;
    reasons.push(`Controparte simile (fuzzy): "${cpScore.matched}"`);
  }

  if (isInvoiceNumberInDescription(invoice.number, movement.description)) {
    score += NUMBER_HINT_BONUS;
    reasons.push(`Numero fattura citato: ${invoice.number}`);
  }

  // IBAN: spesso compare letterale nella descrizione del bonifico. Lo
  // normalizziamo (uppercase + no spazi) prima del confronto.
  if (invoice.paymentIban) {
    const normDesc = movement.description.replace(/\s+/g, "").toUpperCase();
    const normIban = invoice.paymentIban.replace(/\s+/g, "").toUpperCase();
    if (normIban.length >= 15 && normDesc.includes(normIban)) {
      score += W_IBAN_MATCH;
      reasons.push("IBAN beneficiario presente nella descrizione");
    }
  }

  // P.IVA: i bonifici riportano spesso la P.IVA della controparte come
  // riferimento. Match anche se nella descrizione manca il prefisso ISO
  // (es. "IT01234567890" in fattura, "01234567890" nel bonifico).
  if (invoice.counterpartyVat) {
    const normDesc = movement.description.replace(/\s+/g, "").toUpperCase();
    const vat = invoice.counterpartyVat.replace(/\s+/g, "").toUpperCase();
    // Cifre dopo eventuale prefisso paese (es. "IT" + 11 cifre)
    const vatDigits = vat.replace(/^[A-Z]{2}/, "");
    const hit =
      (vat.length >= 8 && normDesc.includes(vat)) ||
      (vatDigits.length >= 8 && normDesc.includes(vatDigits));
    if (hit) {
      score += W_VAT_MATCH;
      reasons.push("P.IVA controparte presente nella descrizione");
    }
  }

  // Alias appresi dai match passati: se uno dei pattern compare nella
  // descrizione (lowercase), aggiungi il boost massimo tra quelli matchati.
  if (aliases.length > 0) {
    const descLower = movement.description.toLowerCase();
    let bestAlias: AliasHint | null = null;
    for (const a of aliases) {
      if (!a.pattern) continue;
      if (descLower.includes(a.pattern)) {
        if (!bestAlias || a.boost > bestAlias.boost) bestAlias = a;
      }
    }
    if (bestAlias) {
      const applied = Math.min(bestAlias.boost, W_ALIAS_MAX);
      score += applied;
      reasons.push(`Alias appreso: "${bestAlias.pattern}" (+${applied})`);
    }
  }

  const expectedDirection: "income" | "expense" =
    invoice.type === "sale" ? "income" : "expense";
  const directionOk = movement.type === expectedDirection;

  if (directionOk) {
    score += W_DIRECTION_OK;
  } else {
    score += W_DIRECTION_WRONG;
    reasons.push("⚠ Direzione opposta (vendita ma movimento uscita o viceversa)");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    expectedDirection,
    directionOk,
  };
}

export type RankedMatch = MatchScore & { movement: MovementForMatch };

export function rankMatches(
  invoice: InvoiceForMatch,
  movements: MovementForMatch[],
  options: { minScore?: number; limit?: number; aliases?: AliasHint[] } = {},
): RankedMatch[] {
  const minScore = options.minScore ?? 30;
  const limit = options.limit ?? 10;
  const aliases = options.aliases ?? [];

  const ranked = movements
    .map((m) => ({ movement: m, ...scoreMatch(invoice, m, aliases) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}

export function classifyScore(score: number): "certain" | "probable" | "weak" | "low" {
  if (score >= 90) return "certain";
  if (score >= 70) return "probable";
  if (score >= 50) return "weak";
  return "low";
}

// --- helpers ---

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

type CounterpartyMatch =
  | { kind: "full"; matched: string }
  | { kind: "partial"; matched: string }
  | { kind: "token"; matched: string }
  | { kind: "near"; matched: string }
  | { kind: "none" };

const SUFFIX_PATTERN = /\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|srl|spa|sas|snc|inc|ltd|llc|gmbh|ag)\b/gi;
const NOISE_PATTERN = /\b(bonifico|pagamento|incasso|addebito|accredito|sepa|fatt(ura|\.)?|n\.?|nr\.?|del|al|da|a|in|per|via|c\/o|spese|commissioni)\b/gi;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-zà-úü0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .replace(SUFFIX_PATTERN, " ")
    .replace(NOISE_PATTERN, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function counterpartyMatchScore(name: string, desc: string): CounterpartyMatch {
  const normName = normalize(name);
  const normDesc = normalize(desc);

  if (!normName || !normDesc) return { kind: "none" };

  if (normDesc.includes(normName)) return { kind: "full", matched: name };

  const baseName = normName.replace(SUFFIX_PATTERN, "").trim();
  if (baseName.length >= 3 && normDesc.includes(baseName)) {
    return { kind: "partial", matched: baseName };
  }

  const nameTokens = tokenize(name);
  const descTokensArr = tokenize(desc);
  const descTokens = new Set(descTokensArr);

  const hits = nameTokens.filter((t) => descTokens.has(t));
  if (hits.length > 0 && hits.length >= Math.ceil(nameTokens.length / 2)) {
    return { kind: "token", matched: hits.join(" ") };
  }

  // Fuzzy: tollera 1-2 caratteri di differenza per typo bancari (es. "ACEM"
  // invece di "ACME"). Confronta ogni name-token con ogni desc-token e
  // accetta se la distanza Levenshtein è entro la soglia in proporzione
  // alla lunghezza.
  const fuzzyHits: string[] = [];
  for (const nt of nameTokens) {
    if (nt.length < 4) continue;
    const tol = nt.length >= 6 ? 2 : 1;
    for (const dt of descTokensArr) {
      if (Math.abs(dt.length - nt.length) > tol) continue;
      if (levenshtein(nt, dt) <= tol) {
        fuzzyHits.push(nt);
        break;
      }
    }
  }
  if (fuzzyHits.length > 0) {
    return { kind: "near", matched: fuzzyHits.join(" ") };
  }

  return { kind: "none" };
}

/**
 * Damerau-Levenshtein distance: come Levenshtein ma conta una trasposizione
 * di caratteri adiacenti come 1 cambio (es. "acme" vs "acem" = 1 swap = 1).
 * Cattura i tipici typo di battitura presenti negli estratti bancari.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const n = a.length, m = b.length;
  // Matrice DP completa (serve accesso a riga i-2 per la trasposizione)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      // Trasposizione adiacente (Damerau)
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[n][m];
}

function isInvoiceNumberInDescription(number: string, desc: string): boolean {
  if (!number) return false;
  // numero fattura: estrae sequenze di 3+ cifre/digits-slashes, evita false-positive su anni
  const norm = number.replace(/[^a-z0-9/-]/gi, "").toLowerCase();
  if (norm.length < 3) return false;
  return desc.toLowerCase().includes(norm);
}
