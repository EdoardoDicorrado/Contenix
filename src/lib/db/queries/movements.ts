import "server-only";
import { db } from "@/lib/db";
import { normalizeBankDescription } from "@/lib/description-normalizer";
import { computeMovementHash, movementSignature } from "@/lib/movement-hash";
import {
  movements,
  categories,
  employees,
  financialAccounts,
  invoiceMovements,
  invoices,
} from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, inArray, lt, sql, type SQL } from "drizzle-orm";

export type MovementListFilters = {
  type?: "income" | "expense";
  /** Una o più categorie. Stringa singola o array. Se array vuoto → ignorato. */
  categoryId?: string;
  categoryIds?: string[];
  employeeId?: string;
  accountId?: string;
  search?: string;
  from?: Date;
  to?: Date;
};

export async function listMovements(filters: MovementListFilters = {}) {
  const conds: SQL[] = [];
  if (filters.type) conds.push(eq(movements.type, filters.type));
  // Categoria singola (legacy)
  if (filters.categoryId) conds.push(eq(movements.categoryId, filters.categoryId));
  // Categorie multiple (priorità sulla singola se entrambe presenti)
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    conds.push(inArray(movements.categoryId, filters.categoryIds));
  }
  if (filters.employeeId) conds.push(eq(movements.employeeId, filters.employeeId));
  if (filters.accountId) conds.push(eq(movements.accountId, filters.accountId));
  if (filters.search) conds.push(ilike(movements.description, `%${filters.search}%`));
  if (filters.from) conds.push(gte(movements.date, filters.from));
  if (filters.to) conds.push(lt(movements.date, filters.to));

  return db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
      descriptionClean: movements.descriptionClean,
      categoryId: movements.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      employeeId: movements.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      accountId: movements.accountId,
      accountName: financialAccounts.name,
      accountType: financialAccounts.type,
      accountColor: financialAccounts.color,
      isTransfer: movements.isTransfer,
      transferToAccountId: movements.transferToAccountId,
      matchUnavailable: movements.matchUnavailable,
      createdAt: movements.createdAt,
      // Fattura primaria collegata (movimento → ≥0 fatture).
      // Se il movimento è collegato a più fatture (pagamento aggregato),
      // la cella mostra il count totale e dall'overlay si vede la lista intera.
      matchedInvoiceId: sql<string | null>`(
        SELECT im.invoice_id FROM ${invoiceMovements} im
        WHERE im.movement_id = ${movements.id}
        ORDER BY im.created_at ASC
        LIMIT 1
      )`,
      matchedInvoiceNumber: sql<string | null>`(
        SELECT i.number FROM ${invoiceMovements} im
        JOIN ${invoices} i ON im.invoice_id = i.id
        WHERE im.movement_id = ${movements.id}
        ORDER BY im.created_at ASC
        LIMIT 1
      )`,
      matchedInvoiceCounterparty: sql<string | null>`(
        SELECT i.counterparty_name FROM ${invoiceMovements} im
        JOIN ${invoices} i ON im.invoice_id = i.id
        WHERE im.movement_id = ${movements.id}
        ORDER BY im.created_at ASC
        LIMIT 1
      )`,
      matchedInvoiceType: sql<"sale" | "purchase" | null>`(
        SELECT i.type FROM ${invoiceMovements} im
        JOIN ${invoices} i ON im.invoice_id = i.id
        WHERE im.movement_id = ${movements.id}
        ORDER BY im.created_at ASC
        LIMIT 1
      )`,
      matchedInvoiceCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${invoiceMovements} im
        WHERE im.movement_id = ${movements.id}
      )`,
    })
    .from(movements)
    .leftJoin(categories, eq(movements.categoryId, categories.id))
    .leftJoin(employees, eq(movements.employeeId, employees.id))
    .leftJoin(financialAccounts, eq(movements.accountId, financialAccounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(movements.date), desc(movements.createdAt));
}

/**
 * Lista snella di movimenti recenti per un conto, paginata.
 * Usata dal DetailDrawer di /conti — mostra solo i campi che servono.
 */
export async function listRecentMovementsByAccount(
  accountId: string,
  opts: { limit: number; offset: number },
) {
  return db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
      descriptionClean: movements.descriptionClean,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(movements)
    .leftJoin(categories, eq(movements.categoryId, categories.id))
    .where(eq(movements.accountId, accountId))
    .orderBy(desc(movements.date), desc(movements.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

/**
 * Conteggio totale dei movimenti su un conto (per "X di Y" nella paginazione).
 */
export async function countMovementsByAccount(accountId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(movements)
    .where(eq(movements.accountId, accountId));
  return row?.c ?? 0;
}

/**
 * Lista delle fatture collegate a un movimento. Usata per il popover/overlay
 * "match fattura" dalla tabella movimenti.
 */
export async function getMovementInvoiceMatches(movementId: string) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      counterpartyName: invoices.counterpartyName,
      issueDate: invoices.issueDate,
      totalAmount: invoices.totalAmount,
      matchedAmount: invoiceMovements.matchedAmount,
      matchType: invoiceMovements.matchType,
      matchId: invoiceMovements.id,
    })
    .from(invoiceMovements)
    .innerJoin(invoices, eq(invoiceMovements.invoiceId, invoices.id))
    .where(eq(invoiceMovements.movementId, movementId))
    .orderBy(desc(invoices.issueDate));
}

export async function getMovement(id: string) {
  const [row] = await db.select().from(movements).where(eq(movements.id, id)).limit(1);
  return row ?? null;
}

/**
 * Aggregati mensili: per ogni mese che ha movimenti, entrate, uscite, conteggio
 * e quante righe sono trasferimenti. Usata per la vista a cards.
 *
 * Filtri sono gli stessi di listMovements (categoryIds, type, accountId, search).
 * Il filtro `from`/`to` viene ignorato perché qui costruiamo la timeline mensile.
 *
 * Le entrate/uscite ESCLUDONO i trasferimenti (sono solo movimentazione di
 * liquidità, non spese/ricavi reali).
 */
export async function listMonthlyAggregates(filters: MovementListFilters = {}) {
  const conds: SQL[] = [];
  if (filters.type) conds.push(eq(movements.type, filters.type));
  if (filters.categoryId) conds.push(eq(movements.categoryId, filters.categoryId));
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    conds.push(inArray(movements.categoryId, filters.categoryIds));
  }
  if (filters.employeeId) conds.push(eq(movements.employeeId, filters.employeeId));
  if (filters.accountId) conds.push(eq(movements.accountId, filters.accountId));
  if (filters.search) conds.push(ilike(movements.description, `%${filters.search}%`));
  if (filters.from) conds.push(gte(movements.date, filters.from));
  if (filters.to) conds.push(lt(movements.date, filters.to));

  return db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${movements.date}), 'YYYY-MM')`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' AND ${movements.isTransfer} = false THEN ${movements.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' AND ${movements.isTransfer} = false THEN ${movements.amount} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)::int`,
      transferCount: sql<number>`COUNT(*) FILTER (WHERE ${movements.isTransfer} = true)::int`,
    })
    .from(movements)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(sql`date_trunc('month', ${movements.date})`)
    .orderBy(sql`date_trunc('month', ${movements.date}) DESC`);
}

/**
 * Movimenti che richiedono attenzione: o senza categoria, o categorizzati
 * come "Da rivedere" (categoria reale che funge da inbox). Esclude i
 * trasferimenti.
 *
 * Il nome "Da rivedere" è case-insensitive: se l'utente lo rinomina,
 * dovrebbe usare comunque "Da rivedere" come marker.
 */
export async function listUncategorizedMovements() {
  return db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
      accountId: movements.accountId,
      accountName: financialAccounts.name,
      accountColor: financialAccounts.color,
    })
    .from(movements)
    .leftJoin(financialAccounts, eq(movements.accountId, financialAccounts.id))
    .leftJoin(categories, eq(movements.categoryId, categories.id))
    .where(
      and(
        eq(movements.isTransfer, false),
        sql`(${movements.categoryId} IS NULL OR LOWER(${categories.name}) = 'da rivedere')`,
      ),
    )
    .orderBy(desc(movements.date));
}

/**
 * Statistiche aggregate per la pagina /sincronizza. Tutti i contatori sono
 * server-side, sempre live (no cache).
 */
export async function getMovementsStats() {
  // I "categorizzati" sono quelli con una categoria che NON è "Da rivedere";
  // gli unmatched includono sia i NULL sia quelli con categoria "Da rivedere"
  // (la nostra inbox di triage).
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      categorized: sql<number>`COUNT(*) FILTER (
        WHERE ${movements.categoryId} IS NOT NULL
          AND LOWER(${categories.name}) != 'da rivedere'
          AND ${movements.isTransfer} = false
      )::int`,
      transfers: sql<number>`COUNT(*) FILTER (WHERE ${movements.isTransfer} = true)::int`,
      unmatched: sql<number>`COUNT(*) FILTER (
        WHERE ${movements.isTransfer} = false
          AND (${movements.categoryId} IS NULL OR LOWER(${categories.name}) = 'da rivedere')
      )::int`,
    })
    .from(movements)
    .leftJoin(categories, eq(movements.categoryId, categories.id));

  return {
    total: row?.total ?? 0,
    categorized: row?.categorized ?? 0,
    transfers: row?.transfers ?? 0,
    unmatched: row?.unmatched ?? 0,
  };
}

/**
 * Conta i movimenti che richiedono attenzione (senza categoria o categoria
 * "Da rivedere", non transfer). Stesso criterio di listUncategorizedMovements.
 */
export async function countUncategorizedMovements(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(movements)
    .leftJoin(categories, eq(movements.categoryId, categories.id))
    .where(
      and(
        eq(movements.isTransfer, false),
        sql`(${movements.categoryId} IS NULL OR LOWER(${categories.name}) = 'da rivedere')`,
      ),
    );
  return row?.count ?? 0;
}

export type MovementInput = {
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  categoryId: string | null;
  employeeId: string | null;
  accountId?: string | null;
};

export async function createMovement(input: MovementInput) {
  const norm = normalizeBankDescription(input.description);

  // Calcola occurrenceIndex contando i movimenti già esistenti con la stessa
  // signature (counter posizionale per createMovement standalone).
  const sig = movementSignature({
    accountId: input.accountId ?? null,
    date: input.date,
    amount: input.amount,
    type: input.type,
    description: input.description,
  });
  const existing = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(movements)
    .where(
      and(
        input.accountId
          ? eq(movements.accountId, input.accountId)
          : sql`${movements.accountId} IS NULL`,
        eq(movements.date, input.date),
        eq(movements.amount, input.amount),
        eq(movements.type, input.type),
        eq(movements.description, input.description),
      ),
    );
  const occurrenceIndex = existing[0]?.count ?? 0;
  const uniqueHash = computeMovementHash({
    accountId: input.accountId ?? null,
    date: input.date,
    amount: input.amount,
    type: input.type,
    description: input.description,
    occurrenceIndex,
  });
  void sig; // signature non serve qui, solo per documentare il contratto

  const [row] = await db
    .insert(movements)
    .values({
      date: input.date,
      amount: input.amount,
      type: input.type,
      description: input.description,
      descriptionClean: norm.changed ? norm.clean : null,
      categoryId: input.categoryId,
      employeeId: input.employeeId,
      accountId: input.accountId ?? null,
      uniqueHash,
    })
    .returning();
  return row;
}

export async function updateMovement(id: string, input: MovementInput) {
  const norm = normalizeBankDescription(input.description);

  // Ricalcola hash escludendo l'attuale dal conteggio
  const existing = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(movements)
    .where(
      and(
        input.accountId
          ? eq(movements.accountId, input.accountId)
          : sql`${movements.accountId} IS NULL`,
        eq(movements.date, input.date),
        eq(movements.amount, input.amount),
        eq(movements.type, input.type),
        eq(movements.description, input.description),
        sql`${movements.id} <> ${id}`,
      ),
    );
  const occurrenceIndex = existing[0]?.count ?? 0;
  const uniqueHash = computeMovementHash({
    accountId: input.accountId ?? null,
    date: input.date,
    amount: input.amount,
    type: input.type,
    description: input.description,
    occurrenceIndex,
  });

  const [row] = await db
    .update(movements)
    .set({
      date: input.date,
      amount: input.amount,
      type: input.type,
      description: input.description,
      descriptionClean: norm.changed ? norm.clean : null,
      categoryId: input.categoryId,
      employeeId: input.employeeId,
      accountId: input.accountId ?? null,
      uniqueHash,
      updatedAt: new Date(),
    })
    .where(eq(movements.id, id))
    .returning();
  return row;
}

export async function deleteMovement(id: string) {
  await db.delete(movements).where(eq(movements.id, id));
}

/**
 * Aggiorna solo la categoria di un movimento (inline edit nella lista).
 * Non modifica isTransfer / transferToAccountId (per quelli serve il form completo).
 */
export async function updateMovementCategory(id: string, categoryId: string | null) {
  await db
    .update(movements)
    .set({ categoryId, updatedAt: new Date() })
    .where(eq(movements.id, id));
}

/**
 * KPI mensile dei movimenti per la dashboard.
 * I trasferimenti tra conti (is_transfer = true) sono ESCLUSI: non sono spese
 * reali ma solo movimentazione di liquidità, non vanno nel P&L Economic.
 */
export async function getMonthlyKpi(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [row] = await db
    .select({
      entrate: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' THEN ${movements.amount} ELSE 0 END), 0)`,
      uscite: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' THEN ${movements.amount} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)::int`,
      transferCount: sql<number>`COUNT(*) FILTER (WHERE ${movements.isTransfer} = true)::int`,
    })
    .from(movements)
    .where(
      and(
        gte(movements.date, start),
        lt(movements.date, end),
        eq(movements.isTransfer, false),
      ),
    );

  const entrate = parseFloat(row?.entrate ?? "0");
  const uscite = parseFloat(row?.uscite ?? "0");
  return {
    entrate,
    uscite,
    saldo: entrate - uscite,
    count: row?.count ?? 0,
    transferCount: row?.transferCount ?? 0,
  };
}
