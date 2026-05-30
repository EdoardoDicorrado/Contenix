import "server-only";
import { db } from "@/lib/db";
import { invoiceMovements, invoices, movements } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  classifyScore,
  rankMatches,
  type InvoiceForMatch,
  type MovementForMatch,
} from "@/lib/invoice-matching";
import { getAliasesMap } from "./counterparty-aliases";

const WINDOW_DAYS = 90;
/**
 * Soglia minima tra il top match "certain" e il second-best per considerare
 * l'auto-match sicuro. Sotto questa soglia → ambiguità, l'utente decide.
 */
const SAFETY_GAP = 10;
/** Window per il match aggregato (1 movimento → N fatture). */
const AGGREGATE_WINDOW_DAYS = 60;
/** Numero massimo di fatture nel subset aggregato (esplosione esponenziale). */
const AGGREGATE_MAX_INVOICES = 10;
/** Importo minimo del movimento candidato all'aggregato (filtra le commissioni). */
const AGGREGATE_MIN_AMOUNT_CENTS = 5000; // 50€

export type ApplyInvoiceMatchesGroupExample = {
  invoiceId: string;
  invoiceNumber: string;
  counterparty: string;
  totalAmount: string;
  movementId: string;
  movementDate: Date;
  movementDescription: string;
  score: number;
};

export type ApplyInvoiceMatchesResult = {
  /** Fatture esaminate (non già pienamente matchate). */
  totalScanned: number;
  /** Match auto-creati (score "certain" + gap di sicurezza). */
  autoMatched: number;
  /** Fatture con suggerimento ambiguo o non sufficientemente sicuro: serve l'utente. */
  needsReview: number;
  /** Fatture senza alcun candidato sopra soglia. */
  noCandidate: number;
  /** Match aggregati creati (1 movimento → N fatture stesso fornitore). */
  aggregateMatched: number;
  /** Esempi (max 30) dei match creati per il report. */
  examples: ApplyInvoiceMatchesGroupExample[];
};

/**
 * Auto-match in massa fatture ↔ movimenti.
 *
 * Logica:
 *   - Considera solo fatture NON già pienamente matchate (matched_amount < totale).
 *   - Per ognuna calcola i candidati esclusi i movimenti già linkati ad altre
 *     fatture e i transfer (logica già in `suggestMatches`, qui replicata in
 *     batch per evitare N round-trip DB).
 *   - Se il top candidato è "certain" (score >= 90) E supera il second-best
 *     di almeno SAFETY_GAP punti (oppure non c'è alcun second-best) → match
 *     automatico con matchType="auto".
 *   - Altrimenti → conta come "needsReview" (decisione manuale via UI singola).
 */
export async function applyInvoiceMatches(): Promise<ApplyInvoiceMatchesResult> {
  // 1) Lista fatture candidate: non in stato "cancelled" e con matched_amount
  //    inferiore al totale. Le note di credito sono incluse: anche loro vengono
  //    pagate / ricevute come storno.
  const matchedTotalsSub = sql<string>`COALESCE((
    SELECT SUM(${invoiceMovements.matchedAmount})
    FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
      AND ${invoiceMovements.approvalStatus} = 'approved'
  ), 0)`;

  const candidates = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      counterpartyVat: invoices.counterpartyVat,
      issueDate: invoices.issueDate,
      totalAmount: invoices.totalAmount,
      paymentIban: invoices.paymentIban,
      matchedTotal: matchedTotalsSub,
    })
    .from(invoices)
    .where(
      and(
        sql`${invoices.status} <> 'cancelled'`,
        sql`${matchedTotalsSub} < ${invoices.totalAmount}::numeric`,
      ),
    );

  if (candidates.length === 0) {
    return {
      totalScanned: 0,
      autoMatched: 0,
      needsReview: 0,
      noCandidate: 0,
      aggregateMatched: 0,
      examples: [],
    };
  }

  // 2) Carica in un colpo tutti i movement_id già linkati a qualsiasi fattura:
  //    un movimento di solito paga UNA sola fattura, riusarlo è quasi sempre
  //    sbagliato (split tra più fatture resta possibile via flusso manuale).
  const linkedRows = await db
    .select({ movementId: invoiceMovements.movementId })
    .from(invoiceMovements);
  const linkedIds = new Set(linkedRows.map((r) => r.movementId));

  // 3) Carica i movimenti nella finestra utile per le fatture candidate.
  //    Una sola query: filtra per direzione (income/expense) + esclude transfer.
  //    Window globale: min(issueDate) - WINDOW_DAYS ... max(issueDate) + WINDOW_DAYS.
  const dates = candidates.map((c) => c.issueDate.getTime());
  const minTs = Math.min(...dates);
  const maxTs = Math.max(...dates);
  const startWindow = new Date(minTs);
  startWindow.setUTCDate(startWindow.getUTCDate() - WINDOW_DAYS);
  const endWindow = new Date(maxTs);
  endWindow.setUTCDate(endWindow.getUTCDate() + WINDOW_DAYS);

  const allMovs = await db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
    })
    .from(movements)
    .where(
      and(
        gte(movements.date, startWindow),
        lte(movements.date, endWindow),
        eq(movements.isTransfer, false),
        eq(movements.matchUnavailable, false),
      ),
    );

  // Suddividi i movimenti per direzione per filtrare velocemente per ogni fattura
  const incomeMovs: MovementForMatch[] = allMovs
    .filter((m) => m.type === "income" && !linkedIds.has(m.id))
    .map((m) => ({ id: m.id, date: m.date, amount: m.amount, type: m.type, description: m.description }));
  const expenseMovs: MovementForMatch[] = allMovs
    .filter((m) => m.type === "expense" && !linkedIds.has(m.id))
    .map((m) => ({ id: m.id, date: m.date, amount: m.amount, type: m.type, description: m.description }));

  // Batch-load aliases per tutte le controparti candidate (no N+1)
  const aliasesMap = await getAliasesMap(
    candidates.map((c) => c.counterpartyName),
  );

  // Tieni traccia delle fatture matched in fase 1:1 (per fase aggregato)
  const matchedInvoiceIds = new Set<string>();

  // 4) Per ogni fattura, ranking + decisione
  const examples: ApplyInvoiceMatchesGroupExample[] = [];
  let autoMatched = 0;
  let needsReview = 0;
  let noCandidate = 0;
  let aggregateMatched = 0;

  // I match auto-creati nel corso del run vanno ricordati per evitare di
  // riusare lo stesso movimento per due fatture nello stesso batch.
  const reservedInRun = new Set<string>();

  for (const c of candidates) {
    const expectedDir: "income" | "expense" = c.type === "sale" ? "income" : "expense";
    const pool = (expectedDir === "income" ? incomeMovs : expenseMovs).filter(
      (m) => !reservedInRun.has(m.id),
    );

    const startInv = new Date(c.issueDate);
    startInv.setUTCDate(startInv.getUTCDate() - WINDOW_DAYS);
    const endInv = new Date(c.issueDate);
    endInv.setUTCDate(endInv.getUTCDate() + WINDOW_DAYS);

    const localPool = pool.filter(
      (m) => m.date >= startInv && m.date <= endInv,
    );

    const invForMatch: InvoiceForMatch = {
      id: c.id,
      number: c.number,
      type: c.type,
      counterpartyName: c.counterpartyName,
      issueDate: c.issueDate,
      totalAmount: c.totalAmount,
      paymentIban: c.paymentIban,
      counterpartyVat: c.counterpartyVat,
    };

    const aliases = aliasesMap.get(c.counterpartyName) ?? [];
    const ranked = rankMatches(invForMatch, localPool, {
      minScore: 30,
      limit: 3,
      aliases,
    });

    if (ranked.length === 0) {
      noCandidate += 1;
      continue;
    }

    const top = ranked[0];
    const topClass = classifyScore(top.score);
    const second = ranked[1];
    const gap = second ? top.score - second.score : 100;

    const isAutoSafe =
      topClass === "certain" && top.directionOk && gap >= SAFETY_GAP;

    // Persistiamo come "pending" sia il top "certain" sia il top "probable"
    // (score 70-89 con gap≥5 dal secondo). Entrambi finiscono in
    // /fatture/in-approvazione e l'utente li approva in batch. Senza questa
    // estensione, la sezione "probabili pronti" di /fatture/da-rivedere
    // doveva ricalcolare 100 suggestMatches live per ogni caricamento.
    const isProbableSafe =
      topClass === "probable" && top.directionOk && gap >= 5;

    if (!isAutoSafe && !isProbableSafe) {
      needsReview += 1;
      continue;
    }

    await db.insert(invoiceMovements).values({
      invoiceId: c.id,
      movementId: top.movement.id,
      matchedAmount: c.totalAmount,
      matchType: "auto",
      approvalStatus: "pending",
    });

    reservedInRun.add(top.movement.id);
    matchedInvoiceIds.add(c.id);
    autoMatched += 1;

    if (examples.length < 30) {
      examples.push({
        invoiceId: c.id,
        invoiceNumber: c.number,
        counterparty: c.counterpartyName,
        totalAmount: c.totalAmount,
        movementId: top.movement.id,
        movementDate: top.movement.date,
        movementDescription: top.movement.description,
        score: top.score,
      });
    }
  }

  // 5) FASE AGGREGATO: 1 movimento → N fatture stesso fornitore.
  //    Per ogni movimento rimasto, cerca un subset unico di fatture aperte
  //    dello stesso fornitore che sommi al centesimo all'importo del movimento.
  const aggregateRes = await runAggregateMatchPhase({
    candidates,
    matchedInvoiceIds,
    allMovs,
    reservedInRun,
  });
  aggregateMatched = aggregateRes.created;
  // Le fatture che ora sono state aggregate vanno tolte da needsReview
  needsReview = Math.max(0, needsReview - aggregateRes.invoicesCovered);
  examples.push(...aggregateRes.examples);

  return {
    totalScanned: candidates.length,
    autoMatched,
    needsReview,
    noCandidate,
    aggregateMatched,
    examples,
  };
}

// =============================================================================
// FASE AGGREGATO — subset sum N fatture stesso fornitore = 1 movimento
// =============================================================================

type CandidateInvoice = {
  id: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  counterpartyVat: string | null;
  issueDate: Date;
  totalAmount: string;
  paymentIban: string | null;
};

type CandidateMovement = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
};

async function runAggregateMatchPhase(opts: {
  candidates: CandidateInvoice[];
  matchedInvoiceIds: Set<string>;
  allMovs: CandidateMovement[];
  reservedInRun: Set<string>;
}): Promise<{
  created: number;
  invoicesCovered: number;
  examples: ApplyInvoiceMatchesGroupExample[];
}> {
  // Fatture ancora aperte: non già matchate in fase 1:1 E non già pienamente
  // matchate da before (matchedTotal = 0 nei candidates, già filtrato a monte).
  const unmatchedInvoices = opts.candidates.filter(
    (c) => !opts.matchedInvoiceIds.has(c.id),
  );
  if (unmatchedInvoices.length === 0) return { created: 0, invoicesCovered: 0, examples: [] };

  // Movimenti ancora disponibili
  const freeMovs = opts.allMovs.filter((m) => !opts.reservedInRun.has(m.id));
  if (freeMovs.length === 0) return { created: 0, invoicesCovered: 0, examples: [] };

  const examples: ApplyInvoiceMatchesGroupExample[] = [];
  let created = 0;
  let invoicesCovered = 0;

  for (const mov of freeMovs) {
    const movCents = toCents(mov.amount);
    if (movCents < AGGREGATE_MIN_AMOUNT_CENTS) continue;

    const expectedType: "sale" | "purchase" =
      mov.type === "income" ? "sale" : "purchase";

    // Filtro: fatture stesso tipo + finestra temporale stretta + counterparty
    // nel testo del movimento (full/partial/token — usiamo il nome canonico).
    const movWindowStart = new Date(mov.date);
    movWindowStart.setUTCDate(movWindowStart.getUTCDate() - AGGREGATE_WINDOW_DAYS);
    const movWindowEnd = new Date(mov.date);
    movWindowEnd.setUTCDate(movWindowEnd.getUTCDate() + AGGREGATE_WINDOW_DAYS);

    const sameVendorPool = unmatchedInvoices.filter(
      (inv) =>
        inv.type === expectedType &&
        inv.issueDate >= movWindowStart &&
        inv.issueDate <= movWindowEnd &&
        descMentionsCounterparty(mov.description, inv.counterpartyName),
    );

    if (sameVendorPool.length < 2) continue; // serve almeno 2 fatture per parlare di aggregato
    if (sameVendorPool.length > AGGREGATE_MAX_INVOICES) continue; // troppi → skip per safety

    const items = sameVendorPool.map((i) => toCents(i.totalAmount));
    const subset = findUniqueSubset(movCents, items);
    if (!subset || subset.length < 2) continue;

    // Creazione match aggregato — pending, va in /fatture/in-approvazione come
    // gli altri auto-match. L'utente vede il gruppo e può approvarlo in blocco.
    for (const idx of subset) {
      const inv = sameVendorPool[idx];
      await db.insert(invoiceMovements).values({
        invoiceId: inv.id,
        movementId: mov.id,
        matchedAmount: inv.totalAmount,
        matchType: "auto",
        approvalStatus: "pending",
      });
      created += 1;
      invoicesCovered += 1;
      opts.matchedInvoiceIds.add(inv.id);
      if (examples.length < 30) {
        examples.push({
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          counterparty: inv.counterpartyName,
          totalAmount: inv.totalAmount,
          movementId: mov.id,
          movementDate: mov.date,
          movementDescription: mov.description,
          score: 100, // match aggregato univoco
        });
      }
    }
    opts.reservedInRun.add(mov.id);
  }

  return { created, invoicesCovered, examples };
}

function toCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

/**
 * Cerca se la descrizione del movimento contiene il nome canonico della
 * controparte (lowercase + suffissi rimossi). Filtro veloce per evitare
 * subset sum su pool grosso.
 */
function descMentionsCounterparty(desc: string, name: string): boolean {
  const d = desc.toLowerCase();
  const n = name
    .toLowerCase()
    .replace(/[.,/\\]/g, " ")
    .replace(
      /\b(srl|spa|sas|snc|bv|gmbh|ltd|llc|ag|sa|sl|sarl|inc|corp)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return false;
  if (d.includes(n)) return true;
  // Almeno il primo token significativo del nome
  const firstToken = n.split(/\s+/).find((t) => t.length >= 3);
  return firstToken ? d.includes(firstToken) : false;
}

/**
 * Subset sum esatto su importi in centesimi.
 *  - Restituisce gli INDICI dell'unico subset valido
 *  - null se ci sono 0 o ≥ 2 subset (ambiguità → skip)
 *  - Early-exit appena trovato il secondo subset (no esplosione)
 */
function findUniqueSubset(target: number, items: number[]): number[] | null {
  const found: number[][] = [];
  const picked: number[] = [];

  function backtrack(idx: number, remaining: number) {
    if (found.length > 1) return; // ambiguità → stop
    if (remaining === 0 && picked.length > 0) {
      found.push([...picked]);
      return;
    }
    if (idx >= items.length || remaining < 0) return;
    // Skip
    backtrack(idx + 1, remaining);
    if (found.length > 1) return;
    // Include
    picked.push(idx);
    backtrack(idx + 1, remaining - items[idx]);
    picked.pop();
  }

  backtrack(0, target);
  return found.length === 1 ? found[0] : null;
}
