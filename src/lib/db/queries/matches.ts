import "server-only";
import { db } from "@/lib/db";
import { invoiceMovements, movements, invoices } from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  rankMatches,
  scoreMatch,
  type InvoiceForMatch,
  type MovementForMatch,
} from "@/lib/invoice-matching";

export type LinkedMatch = {
  id: string;
  invoiceId: string;
  movementId: string;
  matchedAmount: string;
  matchType: string;
  createdAt: Date;
  movement: {
    id: string;
    date: Date;
    amount: string;
    type: "income" | "expense";
    description: string;
  };
};

export async function getInvoiceMatches(invoiceId: string): Promise<LinkedMatch[]> {
  const rows = await db
    .select({
      id: invoiceMovements.id,
      invoiceId: invoiceMovements.invoiceId,
      movementId: invoiceMovements.movementId,
      matchedAmount: invoiceMovements.matchedAmount,
      matchType: invoiceMovements.matchType,
      createdAt: invoiceMovements.createdAt,
      mId: movements.id,
      mDate: movements.date,
      mAmount: movements.amount,
      mType: movements.type,
      mDescription: movements.description,
    })
    .from(invoiceMovements)
    .innerJoin(movements, eq(invoiceMovements.movementId, movements.id))
    .where(eq(invoiceMovements.invoiceId, invoiceId))
    .orderBy(desc(movements.date));

  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoiceId,
    movementId: r.movementId,
    matchedAmount: r.matchedAmount,
    matchType: r.matchType,
    createdAt: r.createdAt,
    movement: {
      id: r.mId,
      date: r.mDate,
      amount: r.mAmount,
      type: r.mType,
      description: r.mDescription,
    },
  }));
}

export async function suggestMatches(invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return null;

  // ID di TUTTI i movimenti già linkati a qualsiasi fattura: non vanno
  // proposti come candidati (un movimento bancario tipicamente paga UNA sola
  // fattura — riusare lo stesso movimento per 2 fatture è quasi sempre un errore).
  // Per linking multi-fattura (acconti, split) c'è il flusso manuale.
  const allLinked = await db
    .select({ movementId: invoiceMovements.movementId })
    .from(invoiceMovements);
  const linkedIds = new Set(allLinked.map((l) => l.movementId));

  const windowDays = 90;
  const startDate = new Date(inv.issueDate);
  startDate.setUTCDate(startDate.getUTCDate() - windowDays);
  const endDate = new Date(inv.issueDate);
  endDate.setUTCDate(endDate.getUTCDate() + windowDays);

  const expectedDirection: "income" | "expense" =
    inv.type === "sale" ? "income" : "expense";

  const candidates = await db
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
        eq(movements.type, expectedDirection),
        // Esclude trasferimenti banca ↔ conto secondario: non sono pagamenti
        // di fatture, sono solo movimentazione interna di liquidità.
        eq(movements.isTransfer, false),
        gte(movements.date, startDate),
        lte(movements.date, endDate),
      ),
    );

  const available: MovementForMatch[] = candidates.filter((c) => !linkedIds.has(c.id));

  const invoiceForMatch: InvoiceForMatch = {
    id: inv.id,
    number: inv.number,
    type: inv.type,
    counterpartyName: inv.counterpartyName,
    issueDate: inv.issueDate,
    totalAmount: inv.totalAmount,
  };

  return rankMatches(invoiceForMatch, available, { minScore: 30, limit: 5 });
}

export async function createMatch(opts: {
  invoiceId: string;
  movementId: string;
  matchedAmount: string;
  matchType?: "manual" | "auto" | "ai";
}) {
  const [row] = await db
    .insert(invoiceMovements)
    .values({
      invoiceId: opts.invoiceId,
      movementId: opts.movementId,
      matchedAmount: opts.matchedAmount,
      matchType: opts.matchType ?? "manual",
    })
    .returning();
  return row;
}

export async function deleteMatch(id: string) {
  await db.delete(invoiceMovements).where(eq(invoiceMovements.id, id));
}

export async function getMatchedTotal(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${invoiceMovements.matchedAmount}), 0)`,
    })
    .from(invoiceMovements)
    .where(eq(invoiceMovements.invoiceId, invoiceId));
  return parseFloat(row?.total ?? "0");
}

// =============================================================================
// Ricerca manuale + suggerimenti bidirezionali (flusso "Abbina")
// =============================================================================

export type SearchMovementResult = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  alreadyLinked: boolean;
};

/**
 * Cerca movimenti candidati al match manuale per una fattura. Filtri opzionali
 * (testo, anno, mese, tipo). Esclude di default i transfer. I movimenti già
 * linkati ad altre fatture sono inclusi con flag `alreadyLinked = true` così
 * l'utente può scegliere il caso "pagamento aggregato" consapevolmente.
 */
export async function searchMovementsForMatch(opts: {
  invoiceId: string;
  query?: string;
  year?: number;
  month?: number;
  type?: "income" | "expense";
  limit?: number;
}): Promise<SearchMovementResult[]> {
  const conds: SQL[] = [eq(movements.isTransfer, false)];
  if (opts.query && opts.query.trim().length > 0) {
    conds.push(ilike(movements.description, `%${opts.query.trim()}%`));
  }
  if (opts.year != null && opts.month != null) {
    const start = new Date(Date.UTC(opts.year, opts.month - 1, 1));
    const end = new Date(Date.UTC(opts.year, opts.month, 1));
    conds.push(gte(movements.date, start));
    conds.push(lt(movements.date, end));
  } else if (opts.year != null) {
    const start = new Date(Date.UTC(opts.year, 0, 1));
    const end = new Date(Date.UTC(opts.year + 1, 0, 1));
    conds.push(gte(movements.date, start));
    conds.push(lt(movements.date, end));
  }
  if (opts.type) conds.push(eq(movements.type, opts.type));

  const rows = await db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
      linkedCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${invoiceMovements} im
        WHERE im.movement_id = ${movements.id}
          AND im.invoice_id <> ${opts.invoiceId}
      )`,
    })
    .from(movements)
    .where(and(...conds))
    .orderBy(desc(movements.date))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    type: r.type,
    description: r.description,
    alreadyLinked: r.linkedCount > 0,
  }));
}

export type SearchInvoiceResult = {
  id: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  counterpartyVat: string | null;
  issueDate: Date;
  totalAmount: string;
  matchedAmount: string;
  fullyMatched: boolean;
};

/**
 * Cerca fatture candidate al match manuale per un movimento. Filtri opzionali
 * (testo su numero o controparte, anno, mese, tipo). Esclude le cancellate.
 */
export async function searchInvoicesForMatch(opts: {
  movementId: string;
  query?: string;
  year?: number;
  month?: number;
  type?: "sale" | "purchase";
  limit?: number;
}): Promise<SearchInvoiceResult[]> {
  const matchedTotalSql = sql<string>`COALESCE((
    SELECT SUM(${invoiceMovements.matchedAmount})
    FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
  ), 0)`;

  const conds: SQL[] = [ne(invoices.status, "cancelled")];
  if (opts.query && opts.query.trim().length > 0) {
    const q = `%${opts.query.trim()}%`;
    const orCond = or(
      ilike(invoices.number, q),
      ilike(invoices.counterpartyName, q),
    );
    if (orCond) conds.push(orCond);
  }
  if (opts.year != null && opts.month != null) {
    const start = new Date(Date.UTC(opts.year, opts.month - 1, 1));
    const end = new Date(Date.UTC(opts.year, opts.month, 1));
    conds.push(gte(invoices.issueDate, start));
    conds.push(lt(invoices.issueDate, end));
  } else if (opts.year != null) {
    const start = new Date(Date.UTC(opts.year, 0, 1));
    const end = new Date(Date.UTC(opts.year + 1, 0, 1));
    conds.push(gte(invoices.issueDate, start));
    conds.push(lt(invoices.issueDate, end));
  }
  if (opts.type) conds.push(eq(invoices.type, opts.type));

  // Esclude fatture già linkate a questo specifico movimento (sarebbero duplicati)
  conds.push(sql`NOT EXISTS (
    SELECT 1 FROM ${invoiceMovements} im
    WHERE im.invoice_id = ${invoices.id} AND im.movement_id = ${opts.movementId}
  )`);

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      counterpartyVat: invoices.counterpartyVat,
      issueDate: invoices.issueDate,
      totalAmount: invoices.totalAmount,
      matchedAmount: matchedTotalSql,
    })
    .from(invoices)
    .where(and(...conds))
    .orderBy(desc(invoices.issueDate))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    type: r.type,
    counterpartyName: r.counterpartyName,
    counterpartyVat: r.counterpartyVat,
    issueDate: r.issueDate,
    totalAmount: r.totalAmount,
    matchedAmount: r.matchedAmount,
    fullyMatched: parseFloat(r.matchedAmount) >= parseFloat(r.totalAmount) - 0.005,
  }));
}

/**
 * Suggerimenti inversi: dato un movimento, propone le fatture più probabili.
 * Riusa la logica di scoring di `lib/invoice-matching.ts`.
 */
export async function suggestInvoicesForMovement(movementId: string) {
  const [mov] = await db
    .select()
    .from(movements)
    .where(eq(movements.id, movementId))
    .limit(1);
  if (!mov) return null;

  const expectedType: "sale" | "purchase" =
    mov.type === "income" ? "sale" : "purchase";

  const windowDays = 90;
  const startDate = new Date(mov.date);
  startDate.setUTCDate(startDate.getUTCDate() - windowDays);
  const endDate = new Date(mov.date);
  endDate.setUTCDate(endDate.getUTCDate() + windowDays);

  const matchedTotalSql = sql<string>`COALESCE((
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
      matchedTotal: matchedTotalSql,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, expectedType),
        ne(invoices.status, "cancelled"),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        // Non proporre fatture già pienamente matchate
        sql`(${matchedTotalSql})::numeric < ${invoices.totalAmount}::numeric`,
        // Né già linkate a QUESTO movimento
        sql`NOT EXISTS (
          SELECT 1 FROM ${invoiceMovements} im
          WHERE im.invoice_id = ${invoices.id} AND im.movement_id = ${movementId}
        )`,
      ),
    );

  const movForScoring: MovementForMatch = {
    id: mov.id,
    date: mov.date,
    amount: mov.amount,
    type: mov.type,
    description: mov.description,
  };

  const scored = candidates
    .map((c) => {
      const inv: InvoiceForMatch = {
        id: c.id,
        number: c.number,
        type: c.type,
        counterpartyName: c.counterpartyName,
        issueDate: c.issueDate,
        totalAmount: c.totalAmount,
      };
      const score = scoreMatch(inv, movForScoring);
      return { invoice: c, score };
    })
    .filter((s) => s.score.score >= 30)
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, 5);

  return scored;
}
