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

const W_DIRECTION_OK = 7;
const W_DIRECTION_WRONG = -40;

const NUMBER_HINT_BONUS = 6;

export type InvoiceForMatch = {
  id: string;
  number: string;
  type: "purchase" | "sale";
  counterpartyName: string;
  issueDate: Date;
  totalAmount: string;
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

export function scoreMatch(invoice: InvoiceForMatch, movement: MovementForMatch): MatchScore {
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
  }

  if (isInvoiceNumberInDescription(invoice.number, movement.description)) {
    score += NUMBER_HINT_BONUS;
    reasons.push(`Numero fattura citato: ${invoice.number}`);
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
  options: { minScore?: number; limit?: number } = {},
): RankedMatch[] {
  const minScore = options.minScore ?? 30;
  const limit = options.limit ?? 10;

  const ranked = movements
    .map((m) => ({ movement: m, ...scoreMatch(invoice, m) }))
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
  const descTokens = new Set(tokenize(desc));

  const hits = nameTokens.filter((t) => descTokens.has(t));
  if (hits.length > 0 && hits.length >= Math.ceil(nameTokens.length / 2)) {
    return { kind: "token", matched: hits.join(" ") };
  }

  return { kind: "none" };
}

function isInvoiceNumberInDescription(number: string, desc: string): boolean {
  if (!number) return false;
  // numero fattura: estrae sequenze di 3+ cifre/digits-slashes, evita false-positive su anni
  const norm = number.replace(/[^a-z0-9/-]/gi, "").toLowerCase();
  if (norm.length < 3) return false;
  return desc.toLowerCase().includes(norm);
}
