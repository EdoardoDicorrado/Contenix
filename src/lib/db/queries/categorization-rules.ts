import "server-only";
import { db } from "@/lib/db";
import { categorizationRules, categories, movements } from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export type CategorizationRule = typeof categorizationRules.$inferSelect;

export async function listRules() {
  return db
    .select({
      id: categorizationRules.id,
      pattern: categorizationRules.pattern,
      categoryId: categorizationRules.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryType: categories.type,
      movementType: categorizationRules.movementType,
      matchCount: categorizationRules.matchCount,
      createdAt: categorizationRules.createdAt,
      lastMatchedAt: categorizationRules.lastMatchedAt,
    })
    .from(categorizationRules)
    .leftJoin(categories, eq(categorizationRules.categoryId, categories.id))
    .orderBy(desc(categorizationRules.matchCount), desc(categorizationRules.createdAt));
}

export async function getAllRulesForMatching() {
  return db
    .select({
      id: categorizationRules.id,
      pattern: categorizationRules.pattern,
      categoryId: categorizationRules.categoryId,
      movementType: categorizationRules.movementType,
    })
    .from(categorizationRules);
}

export async function createRule(input: {
  pattern: string;
  categoryId: string;
  movementType?: "income" | "expense" | null;
}) {
  const normalized = input.pattern.trim().toLowerCase();
  if (!normalized) throw new Error("Pattern vuoto");

  // Evita duplicati esatti (stessa pattern + stessa categoria)
  const [existing] = await db
    .select({ id: categorizationRules.id })
    .from(categorizationRules)
    .where(
      sql`LOWER(${categorizationRules.pattern}) = ${normalized}
          AND ${categorizationRules.categoryId} = ${input.categoryId}`,
    )
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(categorizationRules)
    .values({
      pattern: normalized,
      categoryId: input.categoryId,
      movementType: input.movementType ?? null,
    })
    .returning();
  return row;
}

export async function deleteRule(id: string) {
  await db.delete(categorizationRules).where(eq(categorizationRules.id, id));
}

/**
 * Conta quanti movimenti hanno la categoria `categoryId`, descrizione che
 * matcha (ILIKE %pattern%) e — se specificato — tipo specifico.
 * Usato per il conflict detection: "questa regola colpisce anche N altri movimenti".
 */
export async function countMovementsForRule(
  pattern: string,
  categoryId: string,
  movementType?: "income" | "expense",
): Promise<number> {
  const conds = [
    eq(movements.categoryId, categoryId),
    sql`LOWER(${movements.description}) LIKE ${"%" + pattern.toLowerCase() + "%"}`,
  ];
  if (movementType) conds.push(eq(movements.type, movementType));
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(movements)
    .where(and(...conds));
  return row?.count ?? 0;
}

/**
 * Sposta una regola in un'altra categoria. Se esiste già una regola con
 * stesso pattern + nuova categoria, restituisce quella e cancella questa
 * (evita duplicati).
 */
export async function moveRuleToCategory(ruleId: string, newCategoryId: string) {
  const [rule] = await db
    .select({ id: categorizationRules.id, pattern: categorizationRules.pattern })
    .from(categorizationRules)
    .where(eq(categorizationRules.id, ruleId))
    .limit(1);
  if (!rule) throw new Error("Regola non trovata");

  // Dedup
  const [existing] = await db
    .select({ id: categorizationRules.id })
    .from(categorizationRules)
    .where(
      sql`LOWER(${categorizationRules.pattern}) = ${rule.pattern.toLowerCase()}
          AND ${categorizationRules.categoryId} = ${newCategoryId}
          AND ${categorizationRules.id} != ${ruleId}`,
    )
    .limit(1);

  if (existing) {
    // Una regola identica esiste già nella categoria di destinazione: cancella la sorgente
    await db.delete(categorizationRules).where(eq(categorizationRules.id, ruleId));
    return { merged: true, ruleId: existing.id };
  }

  await db
    .update(categorizationRules)
    .set({ categoryId: newCategoryId })
    .where(eq(categorizationRules.id, ruleId));
  return { merged: false, ruleId };
}

export async function incrementMatchCount(ruleIds: string[]) {
  if (ruleIds.length === 0) return;
  await db
    .update(categorizationRules)
    .set({
      matchCount: sql`${categorizationRules.matchCount} + 1`,
      lastMatchedAt: new Date(),
    })
    .where(inArray(categorizationRules.id, ruleIds));
}

/**
 * Applica le regole a una descrizione. Ritorna la categoryId della PRIMA regola
 * che matcha (per ora ordine = inserimento; in futuro si può migliorare con score).
 * Pre-condizione: passare `allRules` pre-caricate (evita query per ogni movimento).
 */
export function findMatchingRule(
  description: string,
  movementType: "income" | "expense",
  allRules: Awaited<ReturnType<typeof getAllRulesForMatching>>,
): { categoryId: string; ruleId: string } | null {
  const desc = description.toLowerCase();
  for (const rule of allRules) {
    if (rule.movementType && rule.movementType !== movementType) continue;
    if (desc.includes(rule.pattern)) {
      return { categoryId: rule.categoryId, ruleId: rule.id };
    }
  }
  return null;
}
