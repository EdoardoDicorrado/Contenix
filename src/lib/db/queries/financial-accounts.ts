import "server-only";
import { db } from "@/lib/db";
import { financialAccounts, movements } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type AccountType = FinancialAccount["type"];

export type FinancialAccountInput = {
  name: string;
  type: AccountType;
  currency: string;
  color: string | null;
  identifier: string | null;
  openingBalance: string;
  notes: string | null;
  isPrimary: boolean;
  isActive?: boolean;
};

export async function listAccounts(opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(financialAccounts)
    .where(opts.activeOnly ? eq(financialAccounts.isActive, true) : undefined)
    .orderBy(desc(financialAccounts.isPrimary), asc(financialAccounts.name));
}

export async function listAccountsWithBalance() {
  // Saldo corrente = opening_balance + somma entrate - somma uscite, escludendo
  // i trasferimenti per il conto principale (perché entrano/escono come "esterno")
  // ma includendoli per i conti secondari (per loro un trasferimento è un'uscita
  // o entrata reale dal punto di vista del conto stesso).
  return db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      type: financialAccounts.type,
      currency: financialAccounts.currency,
      color: financialAccounts.color,
      identifier: financialAccounts.identifier,
      isPrimary: financialAccounts.isPrimary,
      isActive: financialAccounts.isActive,
      openingBalance: financialAccounts.openingBalance,
      // saldo = opening + entrate - uscite (di tutti i movimenti del conto)
      computedBalance: sql<string>`
        ${financialAccounts.openingBalance}::numeric +
        COALESCE((
          SELECT SUM(CASE
            WHEN ${movements.type} = 'income' THEN ${movements.amount}::numeric
            ELSE -${movements.amount}::numeric
          END)
          FROM movements
          WHERE movements.account_id = ${financialAccounts.id}
        ), 0)
      `,
      movementsCount: sql<number>`
        COALESCE((
          SELECT COUNT(*)::int FROM movements WHERE movements.account_id = ${financialAccounts.id}
        ), 0)
      `,
    })
    .from(financialAccounts)
    .orderBy(desc(financialAccounts.isPrimary), asc(financialAccounts.name));
}

export async function getAccount(id: string) {
  const [row] = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPrimaryAccount() {
  const [row] = await db
    .select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.isPrimary, true), eq(financialAccounts.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function createAccount(input: FinancialAccountInput) {
  // Se isPrimary=true, deselezionare il precedente conto primario in transazione
  return await db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(financialAccounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(financialAccounts.isPrimary, true));
    }
    const [row] = await tx.insert(financialAccounts).values(input).returning();
    return row;
  });
}

export async function updateAccount(id: string, input: FinancialAccountInput) {
  return await db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(financialAccounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(financialAccounts.isPrimary, true), sql`${financialAccounts.id} <> ${id}`));
    }
    const [row] = await tx
      .update(financialAccounts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(financialAccounts.id, id))
      .returning();
    return row;
  });
}

export async function deleteAccount(id: string) {
  // La FK su movements è "restrict": fallirà se ci sono movimenti collegati
  await db.delete(financialAccounts).where(eq(financialAccounts.id, id));
}

/**
 * Crea il conto principale di default se non esiste e assegna a esso tutti i
 * movimenti senza account_id. Idempotente: si può chiamare più volte.
 */
export async function ensurePrimaryAccountAndMigrate(): Promise<{
  primaryAccountId: string;
  migratedMovements: number;
  created: boolean;
}> {
  return await db.transaction(async (tx) => {
    // 1) Cerca conto primario
    const [existingPrimary] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.isPrimary, true))
      .limit(1);

    let primaryAccountId: string;
    let created = false;

    if (existingPrimary) {
      primaryAccountId = existingPrimary.id;
    } else {
      const [inserted] = await tx
        .insert(financialAccounts)
        .values({
          name: "Conto principale",
          type: "bank",
          currency: "EUR",
          color: "#2563eb",
          openingBalance: "0",
          isPrimary: true,
          isActive: true,
        })
        .returning();
      primaryAccountId = inserted.id;
      created = true;
    }

    // 2) Migra movimenti senza account_id al conto principale
    const result = await tx
      .update(movements)
      .set({ accountId: primaryAccountId, updatedAt: new Date() })
      .where(isNull(movements.accountId))
      .returning({ id: movements.id });

    return {
      primaryAccountId,
      migratedMovements: result.length,
      created,
    };
  });
}
