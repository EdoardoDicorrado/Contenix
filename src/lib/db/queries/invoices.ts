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

/**
 * Origine della fattura:
 *  - cassetto: fatture provenienti dal cassetto fiscale (XML SDI o PDF allegati)
 *  - estere:   fatture caricate come PDF tramite il flusso "estero"
 *              (extractionStatus = "foreign_pdf")
 */
export type InvoiceOrigin = "cassetto" | "estere";

export type InvoiceListFilters = {
  type?: InvoiceType;
  status?: InvoiceStatus;
  search?: string;
  from?: Date;
  to?: Date;
  origin?: InvoiceOrigin;
};

export async function listInvoices(filters: InvoiceListFilters = {}) {
  const conds: SQL[] = [];
  if (filters.type) conds.push(eq(invoices.type, filters.type));
  if (filters.status) conds.push(eq(invoices.status, filters.status));
  if (filters.search) conds.push(ilike(invoices.counterpartyName, `%${filters.search}%`));
  if (filters.from) conds.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conds.push(lt(invoices.issueDate, filters.to));
  if (filters.origin === "estere") {
    conds.push(eq(invoices.extractionStatus, "foreign_pdf"));
  } else if (filters.origin === "cassetto") {
    conds.push(sql`${invoices.extractionStatus} <> 'foreign_pdf'`);
  }

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
      extractionStatus: invoices.extractionStatus,
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
  if (filters.origin === "estere") {
    conds.push(eq(invoices.extractionStatus, "foreign_pdf"));
  } else if (filters.origin === "cassetto") {
    conds.push(sql`${invoices.extractionStatus} <> 'foreign_pdf'`);
  }

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
 * Lista delle fatture estere caricate (extractionStatus = 'foreign_pdf').
 * Ordina dalla più recente.
 */
export async function listForeignInvoices() {
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
      currency: invoices.currency,
      status: invoices.status,
      fileUrl: invoices.fileUrl,
      fileName: invoices.fileName,
      extractionStatus: invoices.extractionStatus,
    })
    .from(invoices)
    .where(eq(invoices.extractionStatus, "foreign_pdf"))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));
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
export type InvoicesToReviewFilters = {
  type?: InvoiceType;
  search?: string;
  from?: Date;
  to?: Date;
};

export async function listInvoicesToReview(
  filters: InvoicesToReviewFilters = {},
) {
  const matchedTotalSql = sql<string>`COALESCE((
    SELECT SUM(${invoiceMovements.matchedAmount})
    FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
      AND ${invoiceMovements.approvalStatus} = 'approved'
  ), 0)`;

  // Esclude fatture con almeno un match pending: quelle vanno in
  // /fatture/in-approvazione, non in da-rivedere.
  const hasPendingMatchSql = sql`EXISTS (
    SELECT 1 FROM ${invoiceMovements}
    WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
      AND ${invoiceMovements.approvalStatus} = 'pending'
  )`;

  const conds: SQL[] = [
    sql`${invoices.status} <> 'cancelled'`,
    sql`(${matchedTotalSql})::numeric < ${invoices.totalAmount}::numeric`,
    sql`NOT ${hasPendingMatchSql}`,
  ];
  if (filters.type) conds.push(eq(invoices.type, filters.type));
  if (filters.search) {
    conds.push(ilike(invoices.counterpartyName, `%${filters.search}%`));
  }
  if (filters.from) conds.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conds.push(lt(invoices.issueDate, filters.to));

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
    .where(and(...conds))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));
}

/**
 * Mesi (YYYY-MM) dal `since` a oggi inclusi in cui NON è stata caricata
 * alcuna fattura emessa (`type = sale`, escluse cancellate).
 *
 * Usata dalla notifica topbar per ricordare al Edoardo di caricare le
 * fatture emesse di un mese (WPaper ne emette tipicamente almeno una al mese).
 */
export async function listMissingSaleMonths(since: Date): Promise<string[]> {
  // Mesi che hanno almeno una fattura emessa (non cancellata)
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${invoices.issueDate}), 'YYYY-MM')`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, "sale"),
        sql`${invoices.status} <> 'cancelled'`,
        gte(invoices.issueDate, since),
      ),
    )
    .groupBy(sql`date_trunc('month', ${invoices.issueDate})`);

  const present = new Set(rows.map((r) => r.month));

  // Lista mesi da `since` al mese corrente compreso
  const result: string[] = [];
  const cursor = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1),
  );
  const now = new Date();
  const lastMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  while (cursor <= lastMonth) {
    const ym = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!present.has(ym)) result.push(ym);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

/**
 * Stats per la card "Match fatture" della sincronizzazione automatica.
 * Conta solo fatture non cancellate.
 */
export async function getInvoiceMatchStats() {
  // 1 sola scan + aggregation per gruppo (vs N subquery per riga).
  // Su 800 fatture passa da ~800ms a ~50ms.
  const rows = await db.execute<{
    total: number;
    matched: number;
    fully_matched: number;
    unmatched: number;
  }>(sql`
    WITH inv_agg AS (
      SELECT
        i.id,
        i.total_amount::numeric AS total_amount,
        COALESCE(SUM(
          CASE WHEN im.approval_status = 'approved' THEN im.matched_amount::numeric END
        ), 0) AS matched_total,
        BOOL_OR(im.approval_status = 'pending') AS has_pending
      FROM invoices i
      LEFT JOIN invoice_movements im ON im.invoice_id = i.id
      WHERE i.status <> 'cancelled'
      GROUP BY i.id, i.total_amount
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE matched_total > 0)::int AS matched,
      COUNT(*) FILTER (WHERE matched_total >= total_amount)::int AS fully_matched,
      COUNT(*) FILTER (WHERE matched_total = 0 AND COALESCE(has_pending, false) = false)::int AS unmatched
    FROM inv_agg
  `);

  const row = rows.rows[0];
  return row
    ? {
        total: row.total,
        matched: row.matched,
        fullyMatched: row.fully_matched,
        unmatched: row.unmatched,
      }
    : { total: 0, matched: 0, fullyMatched: 0, unmatched: 0 };
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
