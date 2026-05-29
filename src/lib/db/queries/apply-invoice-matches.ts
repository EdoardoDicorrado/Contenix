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

const WINDOW_DAYS = 90;
/**
 * Soglia minima tra il top match "certain" e il second-best per considerare
 * l'auto-match sicuro. Sotto questa soglia → ambiguità, l'utente decide.
 */
const SAFETY_GAP = 10;

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
  ), 0)`;

  const candidates = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      issueDate: invoices.issueDate,
      totalAmount: invoices.totalAmount,
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
      ),
    );

  // Suddividi i movimenti per direzione per filtrare velocemente per ogni fattura
  const incomeMovs: MovementForMatch[] = allMovs
    .filter((m) => m.type === "income" && !linkedIds.has(m.id))
    .map((m) => ({ id: m.id, date: m.date, amount: m.amount, type: m.type, description: m.description }));
  const expenseMovs: MovementForMatch[] = allMovs
    .filter((m) => m.type === "expense" && !linkedIds.has(m.id))
    .map((m) => ({ id: m.id, date: m.date, amount: m.amount, type: m.type, description: m.description }));

  // 4) Per ogni fattura, ranking + decisione
  const examples: ApplyInvoiceMatchesGroupExample[] = [];
  let autoMatched = 0;
  let needsReview = 0;
  let noCandidate = 0;

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
    };

    const ranked = rankMatches(invForMatch, localPool, { minScore: 30, limit: 3 });

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

    if (!isAutoSafe) {
      needsReview += 1;
      continue;
    }

    // Crea match. matchedAmount = totale fattura (assumiamo pagamento intero
    // visto che lo score "certain" tipicamente implica importo esatto / quasi).
    await db.insert(invoiceMovements).values({
      invoiceId: c.id,
      movementId: top.movement.id,
      matchedAmount: c.totalAmount,
      matchType: "auto",
    });

    reservedInRun.add(top.movement.id);
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

  return {
    totalScanned: candidates.length,
    autoMatched,
    needsReview,
    noCandidate,
    examples,
  };
}
