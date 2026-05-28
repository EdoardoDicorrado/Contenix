"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, categorizationRules, movements } from "@/lib/db/schema";
import { logCategoryChangesBulk } from "@/lib/db/queries/category-change-log";

const BulkCategorizeSchema = z.object({
  movementIds: z.array(z.string().uuid()).min(1),
  categoryId: z.string().uuid(),
});

const CreateRuleAndApplySchema = z.object({
  pattern: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  movementType: z.enum(["income", "expense"]).nullable(),
  /** Movimenti su cui applicare immediatamente la regola appena creata */
  movementIds: z.array(z.string().uuid()).min(1),
});

export type BulkCategorizeResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

export async function bulkCategorizeAction(
  input: z.infer<typeof BulkCategorizeSchema>,
): Promise<BulkCategorizeResult> {
  const parsed = BulkCategorizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };

  try {
    const result = await db.transaction(async (tx) => {
      // Stato precedente per il log
      const before = await tx
        .select({ id: movements.id, categoryId: movements.categoryId })
        .from(movements)
        .where(inArray(movements.id, parsed.data.movementIds));

      const fromCategoryIds = Array.from(
        new Set(before.map((b) => b.categoryId).filter((x): x is string => !!x)),
      );
      const oldCats = fromCategoryIds.length
        ? await tx
            .select({ id: categories.id, name: categories.name })
            .from(categories)
            .where(inArray(categories.id, fromCategoryIds))
        : [];
      const oldNameById = new Map(oldCats.map((c) => [c.id, c.name]));

      const [newCat] = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, parsed.data.categoryId))
        .limit(1);

      await tx
        .update(movements)
        .set({ categoryId: parsed.data.categoryId, updatedAt: new Date() })
        .where(inArray(movements.id, parsed.data.movementIds));

      await logCategoryChangesBulk(
        before.map((b) => ({
          movementId: b.id,
          fromCategoryId: b.categoryId,
          fromLabel: b.categoryId
            ? oldNameById.get(b.categoryId) ?? "(?)"
            : "Senza categoria",
          toCategoryId: parsed.data.categoryId,
          toLabel: newCat?.name ?? "(?)",
          source: "bulk",
        })),
        tx,
      );

      return { updated: before.length };
    });

    revalidatePath("/movimenti");
    revalidatePath("/movimenti/da-rivedere");
    revalidatePath("/storico-cambiamenti");
    return { ok: true, updated: result.updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

export type CreateRuleAndApplyResult =
  | { ok: true; updated: number; ruleCreated: boolean }
  | { ok: false; error: string };

/**
 * Crea (o riusa, se già esiste con stesso pattern+categoria) una regola di
 * categorizzazione, e in transazione la applica ai movimenti passati.
 */
export async function createRuleAndApplyAction(
  input: z.infer<typeof CreateRuleAndApplySchema>,
): Promise<CreateRuleAndApplyResult> {
  const parsed = CreateRuleAndApplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };

  const { pattern, categoryId, movementType, movementIds } = parsed.data;
  const normalized = pattern.trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Pattern vuoto" };

  try {
    const result = await db.transaction(async (tx) => {
      // Dedup regola
      const [existing] = await tx
        .select({ id: categorizationRules.id })
        .from(categorizationRules)
        .where(
          and(
            sql`LOWER(${categorizationRules.pattern}) = ${normalized}`,
            eq(categorizationRules.categoryId, categoryId),
          ),
        )
        .limit(1);

      let ruleCreated = false;
      if (!existing) {
        await tx.insert(categorizationRules).values({
          pattern: normalized,
          categoryId,
          movementType: movementType ?? null,
        });
        ruleCreated = true;
      }

      // Stato precedente per il log
      const before = await tx
        .select({ id: movements.id, categoryId: movements.categoryId })
        .from(movements)
        .where(inArray(movements.id, movementIds));

      const fromIds = Array.from(
        new Set(before.map((b) => b.categoryId).filter((x): x is string => !!x)),
      );
      const fromCats = fromIds.length
        ? await tx
            .select({ id: categories.id, name: categories.name })
            .from(categories)
            .where(inArray(categories.id, fromIds))
        : [];
      const fromNameById = new Map(fromCats.map((c) => [c.id, c.name]));
      const [newCat] = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);

      await tx
        .update(movements)
        .set({ categoryId, updatedAt: new Date() })
        .where(inArray(movements.id, movementIds));

      await logCategoryChangesBulk(
        before.map((b) => ({
          movementId: b.id,
          fromCategoryId: b.categoryId,
          fromLabel: b.categoryId
            ? fromNameById.get(b.categoryId) ?? "(?)"
            : "Senza categoria",
          toCategoryId: categoryId,
          toLabel: newCat?.name ?? "(?)",
          source: "rule-new",
        })),
        tx,
      );

      return { ruleCreated, updated: before.length };
    });

    revalidatePath("/movimenti");
    revalidatePath("/movimenti/da-rivedere");
    revalidatePath("/regole");
    revalidatePath("/storico-cambiamenti");
    return { ok: true, updated: result.updated, ruleCreated: result.ruleCreated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
