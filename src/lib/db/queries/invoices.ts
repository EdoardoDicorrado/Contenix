import "server-only";
import { db } from "@/lib/db";
import { invoiceMovements, invoices, movements } from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";

export type InvoiceStatus =
  | "pending"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";
export type InvoiceType = "purchase" | "sale";

export type InvoiceInput = {
  number: string;
  type: InvoiceType;
  counterpartyName: string;
  counterpartyVat: string | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: string;
  vatAmount: string | null;
  currency: string;
  status: InvoiceStatus;
  description?: string | null;
  paymentIban?: string | null;
  isCreditNote?: boolean;
  relatedInvoiceId?: string | null;
  /** Campi opzionali per allegato — settati solo se nuovo upload */
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
};

export type InvoiceListFilters = {
  type?: InvoiceType;
  status?: InvoiceStatus;
  search?: string;
  from?: Date;
  to?: Date;
};

export async function listInvoices(filters: InvoiceListFilters = {}) {
  const conds: SQL[] = [];
  if (filters.type) conds.push(eq(invoices.type, filters.type));
  if (filters.status) conds.push(eq(invoices.status, filters.status));
  if (filters.search) conds.push(ilike(invoices.counterpartyName, `%${filters.search}%`));
  if (filters.from) conds.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conds.push(lt(invoices.issueDate, filters.to));

  // paidAt = data del movimento più recente collegato (via invoice_movements).
  // L'invoice_id va qualificato esplicitamente come "invoices"."id" perché
  // dentro la subquery `${invoices.id}` viene stampato solo come "id" e
  // collide con le altre tabelle joinate.
  const paidAtSql = sql<Date | null>`(
    SELECT MAX(m.date) FROM ${movements} m
    JOIN ${invoiceMovements} im ON im.movement_id = m.id
    WHERE im.invoice_id = "invoices"."id"
  )`;

  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      counterpartyVat: invoices.counterpartyVat,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalAmount: invoices.totalAmount,
      vatAmount: invoices.vatAmount,
      currency: invoices.currency,
      status: invoices.status,
      isCreditNote: invoices.isCreditNote,
      paidAt: paidAtSql,
    })
    .from(invoices)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));
}

/**
 * Aggregati mensili delle fatture per la vista a card (come /movimenti).
 * Mese-per-mese: vendite, acquisti, count.
 */
export type MonthlyInvoiceAggregate = {
  month: string; // YYYY-MM
  revenue: string;
  cost: string;
  /** Vendite del mese ancora da incassare (pending/partial/overdue, escluse note di credito). */
  receivable: string;
  count: number;
};

export async function listMonthlyInvoiceAggregates(
  filters: Omit<InvoiceListFilters, "from" | "to"> & {
    from?: Date;
    to?: Date;
  } = {},
): Promise<MonthlyInvoiceAggregate[]> {
  const conds: SQL[] = [];
  if (filters.type) conds.push(eq(invoices.type, filters.type));
  if (filters.status) conds.push(eq(invoices.status, filters.status));
  if (filters.search) conds.push(ilike(invoices.counterpartyName, `%${filters.search}%`));
  if (filters.from) conds.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conds.push(lt(invoices.issueDate, filters.to));

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${invoices.issueDate}), 'YYYY-MM')`,
      revenue: sql<string>`COALESCE(SUM(CASE
        WHEN ${invoices.type} = 'sale' AND ${invoices.isCreditNote} = false THEN ${invoices.totalAmount}::numeric
        WHEN ${invoices.type} = 'sale' AND ${invoices.isCreditNote} = true THEN -${invoices.totalAmount}::numeric
        ELSE 0
      END), 0)::text`,
      cost: sql<string>`COALESCE(SUM(CASE
        WHEN ${invoices.type} = 'purchase' AND ${invoices.isCreditNote} = false THEN ${invoices.totalAmount}::numeric
        WHEN ${invoices.type} = 'purchase' AND ${invoices.isCreditNote} = true THEN -${invoices.totalAmount}::numeric
        ELSE 0
      END), 0)::text`,
      receivable: sql<string>`COALESCE(SUM(CASE
        WHEN ${invoices.type} = 'sale'
          AND ${invoices.isCreditNote} = false
          AND ${invoices.status} IN ('pending','partial','overdue')
        THEN ${invoices.totalAmount}::numeric
        ELSE 0
      END), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(sql`date_trunc('month', ${invoices.issueDate})`)
    .orderBy(desc(sql`date_trunc('month', ${invoices.issueDate})`));

  return rows;
}

export async function getInvoice(id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return row ?? null;
}

export async function createInvoice(input: InvoiceInput) {
  const [row] = await db.insert(invoices).values(input).returning();
  return row;
}

export async function updateInvoice(id: string, input: InvoiceInput) {
  const [row] = await db
    .update(invoices)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning();
  return row;
}

export async function deleteInvoice(id: string) {
  await db.delete(invoices).where(eq(invoices.id, id));
}

/**
 * Lista delle fatture "da rivedere" lato matching:
 *  - non cancellate
 *  - matched_total < totale fattura (zero match OPPURE match parziale)
 *
 * Restituisce ordinamento "più vecchie prima" così l'utente parte dalle
 * arretrate. Include `matchedAmount` per distinguere a colpo d'occhio
 * "completamente da matchare" da "in parte già matchata".
 */
export async function listInvoicesToReview() {
  const matchedTotalSql = sql<string>`COALESCE((
    SELECT SUM(${invoiceMovements.matchedAmount})
    FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
  ), 0)`;

  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      counterpartyVat: invoices.counterpartyVat,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalAmount: invoices.totalAmount,
      isCreditNote: invoices.isCreditNote,
      matchedAmount: matchedTotalSql,
    })
    .from(invoices)
    .where(
      and(
        sql`${invoices.status} <> 'cancelled'`,
        sql`(${matchedTotalSql})::numeric < ${invoices.totalAmount}::numeric`,
      ),
    )
    .orderBy(invoices.issueDate, invoices.createdAt);
}

/**
 * Stats per la card "Match fatture" della sincronizzazione automatica.
 * Conta solo fatture non cancellate.
 */
export async function getInvoiceMatchStats() {
  const matchedTotalSub = sql<string>`COALESCE((
    SELECT SUM(${invoiceMovements.matchedAmount})
    FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
  ), 0)`;

  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      matched: sql<number>`COUNT(*) FILTER (WHERE (${matchedTotalSub})::numeric > 0)::int`,
      fullyMatched: sql<number>`COUNT(*) FILTER (WHERE (${matchedTotalSub})::numeric >= ${invoices.totalAmount}::numeric)::int`,
      unmatched: sql<number>`COUNT(*) FILTER (WHERE (${matchedTotalSub})::numeric = 0)::int`,
    })
    .from(invoices)
    .where(sql`${invoices.status} <> 'cancelled'`);

  return (
    row ?? { total: 0, matched: 0, fullyMatched: 0, unmatched: 0 }
  );
}

export async function getInvoicesStats() {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'pending')::int`,
      paid: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'paid')::int`,
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} IN ('pending','partial','overdue') AND ${invoices.dueDate} < NOW())::int`,
      totalPendingAmount: sql<string>`COALESCE(SUM(${invoices.totalAmount}) FILTER (WHERE ${invoices.status} IN ('pending','partial','overdue')), 0)`,
    })
    .from(invoices);
  return row ?? { total: 0, pending: 0, paid: 0, overdue: 0, totalPendingAmount: "0" };
}

/**
 * KPI fatture per un mese specifico.
 * Le note di credito (isCreditNote=true) sono SOTTRATTE dai totali.
 */
export async function getMonthlyInvoiceKpi(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  // Vendite del mese (al netto delle note di credito di vendita)
  const [salesRow] = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(CASE
        WHEN ${invoices.isCreditNote} = false THEN ${invoices.totalAmount}
        ELSE -${invoices.totalAmount}
      END), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, "sale"),
        gte(invoices.issueDate, start),
        lt(invoices.issueDate, end),
      ),
    );

  // Acquisti del mese (al netto delle note di credito di acquisto)
  const [purchasesRow] = await db
    .select({
      cost: sql<string>`COALESCE(SUM(CASE
        WHEN ${invoices.isCreditNote} = false THEN ${invoices.totalAmount}
        ELSE -${invoices.totalAmount}
      END), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, "purchase"),
        gte(invoices.issueDate, start),
        lt(invoices.issueDate, end),
      ),
    );

  // Da incassare (vendite non pagate, indipendente dal mese)
  const [receivablesRow] = await db
    .select({
      amount: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
      overdueAmount: sql<string>`COALESCE(SUM(${invoices.totalAmount}) FILTER (WHERE ${invoices.dueDate} < NOW()), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, "sale"),
        eq(invoices.isCreditNote, false),
        sql`${invoices.status} IN ('pending', 'partial', 'overdue')`,
      ),
    );

  // Da pagare (acquisti non pagati, indipendente dal mese)
  const [payablesRow] = await db
    .select({
      amount: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
      overdueAmount: sql<string>`COALESCE(SUM(${invoices.totalAmount}) FILTER (WHERE ${invoices.dueDate} < NOW()), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, "purchase"),
        eq(invoices.isCreditNote, false),
        sql`${invoices.status} IN ('pending', 'partial', 'overdue')`,
      ),
    );

  return {
    revenue: parseFloat(salesRow?.revenue ?? "0"),
    revenueCount: salesRow?.count ?? 0,
    cost: parseFloat(purchasesRow?.cost ?? "0"),
    costCount: purchasesRow?.count ?? 0,
    receivables: parseFloat(receivablesRow?.amount ?? "0"),
    receivablesOverdue: parseFloat(receivablesRow?.overdueAmount ?? "0"),
    receivablesCount: receivablesRow?.count ?? 0,
    payables: parseFloat(payablesRow?.amount ?? "0"),
    payablesOverdue: parseFloat(payablesRow?.overdueAmount ?? "0"),
    payablesCount: payablesRow?.count ?? 0,
  };
}

export type InvoiceForExport = typeof invoices.$inferSelect;

/**
 * Lista fatture per export (commercialista). Range di date sui issueDate.
 * Ordina per data di emissione crescente per registro IVA.
 */
export async function listInvoicesForExport(opts: {
  from: Date;
  to: Date;
  type?: InvoiceType;
}): Promise<InvoiceForExport[]> {
  const conds: SQL[] = [
    gte(invoices.issueDate, opts.from),
    lt(invoices.issueDate, opts.to),
  ];
  if (opts.type) conds.push(eq(invoices.type, opts.type));

  return db
    .select()
    .from(invoices)
    .where(and(...conds))
    .orderBy(invoices.issueDate, invoices.number);
}
