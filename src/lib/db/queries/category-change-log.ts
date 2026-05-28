import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categoryChangeLog,
  movements,
  financialAccounts,
} from "@/lib/db/schema";

export type ChangeSource = "sync" | "inline" | "manual" | "bulk" | "rule-new" | "import";

export type LogChangeInput = {
  movementId: string;
  fromCategoryId: string | null;
  fromLabel: string;
  toCategoryId: string | null;
  toLabel: string;
  source: ChangeSource;
};

// Tipo per il transaction handle di Drizzle. Lo semplifichiamo come tipo
// strutturalmente compatibile con `db` (insert/select/update/delete).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxLike = any;

/**
 * Registra un cambio di categoria nel log. Accetta un tx opzionale per
 * inserirsi in transazioni più grandi (es. apply rules).
 */
export async function logCategoryChange(
  input: LogChangeInput,
  tx?: TxLike,
): Promise<void> {
  if (input.fromLabel === input.toLabel) return; // no-op se non cambia nulla
  const target = tx ?? db;
  await target.insert(categoryChangeLog).values({
    movementId: input.movementId,
    fromCategoryId: input.fromCategoryId,
    fromLabel: input.fromLabel,
    toCategoryId: input.toCategoryId,
    toLabel: input.toLabel,
    source: input.source,
  });
}

/**
 * Versione bulk: insert in una sola query (più veloce per apply rules).
 */
export async function logCategoryChangesBulk(
  inputs: LogChangeInput[],
  tx?: TxLike,
): Promise<void> {
  const valid = inputs.filter((i) => i.fromLabel !== i.toLabel);
  if (valid.length === 0) return;
  const target = tx ?? db;
  const CHUNK = 500;
  for (let i = 0; i < valid.length; i += CHUNK) {
    await target.insert(categoryChangeLog).values(
      valid.slice(i, i + CHUNK).map((v) => ({
        movementId: v.movementId,
        fromCategoryId: v.fromCategoryId,
        fromLabel: v.fromLabel,
        toCategoryId: v.toCategoryId,
        toLabel: v.toLabel,
        source: v.source,
      })),
    );
  }
}

// ===================================================================
// QUERY: aggregati per pagina /storico-cambiamenti
// ===================================================================

export type ChangePairSummary = {
  fromLabel: string;
  toLabel: string;
  count: number;
  lastChangedAt: Date;
  /** Sorgenti distinte coinvolte (es. ["sync", "inline"]) */
  sources: string[];
};

/**
 * Aggrega il log per coppia (fromLabel → toLabel), ordinato per ultimo
 * cambio più recente. Una card per ogni coppia.
 */
export async function listChangePairs(): Promise<ChangePairSummary[]> {
  const rows = await db
    .select({
      fromLabel: categoryChangeLog.fromLabel,
      toLabel: categoryChangeLog.toLabel,
      count: sql<number>`COUNT(*)::int`,
      lastChangedAt: sql<Date>`MAX(${categoryChangeLog.changedAt})`,
      sources: sql<string>`STRING_AGG(DISTINCT ${categoryChangeLog.source}::text, ',')`,
    })
    .from(categoryChangeLog)
    .groupBy(categoryChangeLog.fromLabel, categoryChangeLog.toLabel)
    .orderBy(desc(sql`MAX(${categoryChangeLog.changedAt})`));

  return rows.map((r) => ({
    fromLabel: r.fromLabel,
    toLabel: r.toLabel,
    count: r.count,
    lastChangedAt: new Date(r.lastChangedAt),
    sources: (r.sources ?? "").split(",").filter(Boolean),
  }));
}

export type ChangeDetailRow = {
  id: string;
  movementId: string;
  date: Date;
  amount: string;
  description: string;
  source: string;
  changedAt: Date;
  accountName: string | null;
};

/**
 * Numero totale di righe nel log (per soglia di archiviazione).
 */
export async function countChangeLogEntries(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(categoryChangeLog);
  return row?.count ?? 0;
}

/**
 * Archivia: tiene solo gli ultimi N entries (i più recenti per changedAt),
 * cancella tutto il resto. Restituisce quante righe sono state cancellate.
 */
export async function archiveOldChangeLog(keepLast: number): Promise<number> {
  // Identifica id da conservare
  const keeperIds = await db
    .select({ id: categoryChangeLog.id })
    .from(categoryChangeLog)
    .orderBy(desc(categoryChangeLog.changedAt))
    .limit(keepLast);

  if (keeperIds.length === 0) return 0;

  const keeperSet = keeperIds.map((r) => r.id);

  // Cancella tutto tranne questi
  const result = await db
    .delete(categoryChangeLog)
    .where(sql`${categoryChangeLog.id} NOT IN (${sql.join(keeperSet.map((id) => sql`${id}`), sql`, `)})`)
    .returning({ id: categoryChangeLog.id });

  return result.length;
}

/**
 * Lista dettagliata dei movimenti coinvolti in una coppia (fromLabel → toLabel),
 * ordinati per data del cambio.
 */
export async function listChangesForPair(
  fromLabel: string,
  toLabel: string,
): Promise<ChangeDetailRow[]> {
  const rows = await db
    .select({
      id: categoryChangeLog.id,
      movementId: categoryChangeLog.movementId,
      date: movements.date,
      amount: movements.amount,
      description: movements.description,
      source: categoryChangeLog.source,
      changedAt: categoryChangeLog.changedAt,
      accountName: financialAccounts.name,
    })
    .from(categoryChangeLog)
    .leftJoin(movements, eq(categoryChangeLog.movementId, movements.id))
    .leftJoin(financialAccounts, eq(movements.accountId, financialAccounts.id))
    .where(
      and(
        eq(categoryChangeLog.fromLabel, fromLabel),
        eq(categoryChangeLog.toLabel, toLabel),
      ),
    )
    .orderBy(desc(categoryChangeLog.changedAt));

  return rows.map((r) => ({
    id: r.id,
    movementId: r.movementId,
    date: r.date ?? new Date(0),
    amount: r.amount ?? "0",
    description: r.description ?? "(movimento eliminato)",
    source: r.source,
    changedAt: r.changedAt,
    accountName: r.accountName,
  }));
}
