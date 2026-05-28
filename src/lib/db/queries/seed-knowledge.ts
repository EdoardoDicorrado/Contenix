import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, categorizationRules } from "@/lib/db/schema";
import {
  RECOMMENDED_TAXONOMY,
  VENDOR_RULES,
} from "@/lib/storico-knowledge";

export type SeedResult = {
  createdCategories: number;
  skippedCategories: number;
  createdRules: number;
  skippedRules: number;
  missingCategories: string[]; // regole che riferiscono categorie non risolvibili
};

/**
 * Crea (in transazione, idempotente) le categorie consigliate e le regole di
 * categorizzazione basate sulla knowledge base curata.
 *
 * Idempotente:
 *  - Categorie: skip se esiste una con stesso nome (case-insensitive).
 *  - Regole: skip se esiste una con stesso pattern + stessa categoryId.
 */
export async function seedKnowledgeBase(): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    let createdCategories = 0;
    let skippedCategories = 0;
    let createdRules = 0;
    let skippedRules = 0;
    const missingCategories: string[] = [];

    // (1) Categorie
    const canonicalToId = new Map<string, string>();
    for (const entry of RECOMMENDED_TAXONOMY) {
      const [existing] = await tx
        .select({ id: categories.id, name: categories.name, type: categories.type })
        .from(categories)
        .where(sql`LOWER(${categories.name}) = ${entry.name.toLowerCase()}`)
        .limit(1);

      if (existing) {
        canonicalToId.set(entry.name, existing.id);
        skippedCategories += 1;
        continue;
      }

      const [row] = await tx
        .insert(categories)
        .values({
          name: entry.name,
          type: entry.type,
          color: entry.color,
        })
        .returning({ id: categories.id });
      canonicalToId.set(entry.name, row.id);
      createdCategories += 1;
    }

    // (2) Regole di categorizzazione
    for (const rule of VENDOR_RULES) {
      const catId = canonicalToId.get(rule.categoryCanonical);
      if (!catId) {
        if (!missingCategories.includes(rule.categoryCanonical)) {
          missingCategories.push(rule.categoryCanonical);
        }
        continue;
      }
      const normalized = rule.pattern.trim().toLowerCase();
      if (!normalized) continue;

      const [existing] = await tx
        .select({ id: categorizationRules.id })
        .from(categorizationRules)
        .where(
          and(
            sql`LOWER(${categorizationRules.pattern}) = ${normalized}`,
            eq(categorizationRules.categoryId, catId),
          ),
        )
        .limit(1);

      if (existing) {
        skippedRules += 1;
        continue;
      }

      await tx.insert(categorizationRules).values({
        pattern: normalized,
        categoryId: catId,
        movementType: rule.movementType,
      });
      createdRules += 1;
    }

    return {
      createdCategories,
      skippedCategories,
      createdRules,
      skippedRules,
      missingCategories,
    };
  });
}
