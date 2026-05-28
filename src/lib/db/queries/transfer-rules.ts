import "server-only";
import { db } from "@/lib/db";
import { transferRules, financialAccounts } from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray, sql } from "drizzle-orm";

const sourceAccount = alias(financialAccounts, "source_account");
const targetAccount = alias(financialAccounts, "target_account");

export async function listTransferRules() {
  return db
    .select({
      id: transferRules.id,
      pattern: transferRules.pattern,
      targetAccountId: transferRules.targetAccountId,
      targetAccountName: targetAccount.name,
      targetAccountColor: targetAccount.color,
      sourceAccountId: transferRules.sourceAccountId,
      sourceAccountName: sourceAccount.name,
      matchCount: transferRules.matchCount,
      createdAt: transferRules.createdAt,
      lastMatchedAt: transferRules.lastMatchedAt,
    })
    .from(transferRules)
    .leftJoin(targetAccount, eq(transferRules.targetAccountId, targetAccount.id))
    .leftJoin(sourceAccount, eq(transferRules.sourceAccountId, sourceAccount.id))
    .orderBy(desc(transferRules.matchCount), desc(transferRules.createdAt));
}

export async function getAllTransferRulesForMatching() {
  return db
    .select({
      id: transferRules.id,
      pattern: transferRules.pattern,
      targetAccountId: transferRules.targetAccountId,
      sourceAccountId: transferRules.sourceAccountId,
    })
    .from(transferRules);
}

export async function createTransferRule(input: {
  pattern: string;
  targetAccountId: string;
  sourceAccountId?: string | null;
}) {
  const normalized = input.pattern.trim().toLowerCase();
  if (!normalized) throw new Error("Pattern vuoto");
  if (normalized.length < 3)
    throw new Error("Pattern troppo corto (minimo 3 caratteri)");

  // Evita duplicati esatti (stessa pattern + stesso target + stesso source)
  const [existing] = await db
    .select({ id: transferRules.id })
    .from(transferRules)
    .where(
      sql`LOWER(${transferRules.pattern}) = ${normalized}
          AND ${transferRules.targetAccountId} = ${input.targetAccountId}
          AND (
            (${transferRules.sourceAccountId} IS NULL AND ${input.sourceAccountId ?? null}::uuid IS NULL)
            OR ${transferRules.sourceAccountId} = ${input.sourceAccountId ?? null}::uuid
          )`,
    )
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(transferRules)
    .values({
      pattern: normalized,
      targetAccountId: input.targetAccountId,
      sourceAccountId: input.sourceAccountId ?? null,
    })
    .returning();
  return row;
}

export async function deleteTransferRule(id: string) {
  await db.delete(transferRules).where(eq(transferRules.id, id));
}

export async function incrementTransferMatchCount(ruleIds: string[]) {
  if (ruleIds.length === 0) return;
  await db
    .update(transferRules)
    .set({
      matchCount: sql`${transferRules.matchCount} + 1`,
      lastMatchedAt: new Date(),
    })
    .where(inArray(transferRules.id, ruleIds));
}

/**
 * Applica le regole transfer a una descrizione + sourceAccountId.
 * Ritorna la regola che matcha (con targetAccountId), o null.
 * Pre-condizione: passare `allRules` pre-caricate (evita query per movimento).
 */
export function findMatchingTransferRule(
  description: string,
  sourceAccountId: string | null,
  allRules: Awaited<ReturnType<typeof getAllTransferRulesForMatching>>,
): { ruleId: string; targetAccountId: string } | null {
  const desc = description.toLowerCase();
  for (const rule of allRules) {
    // Se la regola ha sourceAccountId, deve combaciare
    if (rule.sourceAccountId && rule.sourceAccountId !== sourceAccountId) continue;
    if (desc.includes(rule.pattern)) {
      return { ruleId: rule.id, targetAccountId: rule.targetAccountId };
    }
  }
  return null;
}
