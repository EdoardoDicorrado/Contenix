"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createRule,
  deleteRule,
  moveRuleToCategory,
} from "@/lib/db/queries/categorization-rules";
import {
  createTransferRule,
  deleteTransferRule,
} from "@/lib/db/queries/transfer-rules";
import {
  applyRulesToMovements,
  type ApplyRulesResult,
} from "@/lib/db/queries/apply-rules";
import {
  seedKnowledgeBase,
  type SeedResult,
} from "@/lib/db/queries/seed-knowledge";

const IdSchema = z.string().uuid();

export type SeedActionResult =
  | { ok: true; result: SeedResult }
  | { ok: false; error: string };

export async function seedKnowledgeAction(): Promise<SeedActionResult> {
  try {
    const result = await seedKnowledgeBase();
    revalidatePath("/regole");
    revalidatePath("/categorie");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore sconosciuto",
    };
  }
}

const ApplyRulesSchema = z.object({
  overrideExisting: z.boolean(),
});

export type ApplyRulesActionResult =
  | { ok: true; result: ApplyRulesResult }
  | { ok: false; error: string };

export async function applyRulesAction(
  input: z.infer<typeof ApplyRulesSchema>,
): Promise<ApplyRulesActionResult> {
  const parsed = ApplyRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Parametri non validi" };
  }
  try {
    const result = await applyRulesToMovements(parsed.data);
    revalidatePath("/regole");
    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore sconosciuto",
    };
  }
}

export async function deleteCategoryRuleAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return;
  await deleteRule(parsed.data);
  revalidatePath("/regole");
}

const MoveRuleSchema = z.object({
  ruleId: z.string().uuid(),
  newCategoryId: z.string().uuid(),
});

export type MoveRuleResult =
  | { ok: true; merged: boolean }
  | { ok: false; error: string };

export async function moveCategoryRuleAction(
  input: z.infer<typeof MoveRuleSchema>,
): Promise<MoveRuleResult> {
  const parsed = MoveRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };
  try {
    const result = await moveRuleToCategory(parsed.data.ruleId, parsed.data.newCategoryId);
    revalidatePath("/regole");
    return { ok: true, merged: result.merged };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

export async function deleteTransferRuleAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return;
  await deleteTransferRule(parsed.data);
  revalidatePath("/regole");
}

// ===================================================================
// CREATE: nuove regole manuali
// ===================================================================

const CreateCategoryRuleSchema = z.object({
  pattern: z.string().min(2, "Almeno 2 caratteri").max(200),
  categoryId: z.string().uuid("Categoria mancante"),
  movementType: z.enum(["income", "expense", "any"]),
});

export type CreateCategoryRuleResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createCategoryRuleAction(
  input: z.infer<typeof CreateCategoryRuleSchema>,
): Promise<CreateCategoryRuleResult> {
  const parsed = CreateCategoryRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input non valido" };
  }
  try {
    await createRule({
      pattern: parsed.data.pattern,
      categoryId: parsed.data.categoryId,
      movementType: parsed.data.movementType === "any" ? null : parsed.data.movementType,
    });
    revalidatePath("/regole");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

const CreateTransferRuleSchema = z.object({
  pattern: z.string().min(3, "Almeno 3 caratteri").max(200),
  targetAccountId: z.string().uuid("Conto destinazione mancante"),
  sourceAccountId: z.string().uuid().nullable(),
});

export type CreateTransferRuleResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createTransferRuleAction(
  input: z.infer<typeof CreateTransferRuleSchema>,
): Promise<CreateTransferRuleResult> {
  const parsed = CreateTransferRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input non valido" };
  }
  try {
    await createTransferRule({
      pattern: parsed.data.pattern,
      targetAccountId: parsed.data.targetAccountId,
      sourceAccountId: parsed.data.sourceAccountId,
    });
    revalidatePath("/regole");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
