"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createMovement,
  updateMovement,
  deleteMovement,
} from "@/lib/db/queries/movements";
import {
  createRule,
  getAllRulesForMatching,
  findMatchingRule,
  incrementMatchCount,
} from "@/lib/db/queries/categorization-rules";
import { getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { createTransferRule } from "@/lib/db/queries/transfer-rules";

const MovementSchema = z.object({
  date: z.string().min(1, "Data obbligatoria"),
  amount: z
    .string()
    .min(1, "Importo obbligatorio")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Importo deve essere un numero positivo",
    }),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  categoryId: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  isTransfer: z.string().optional(),
  transferToAccountId: z.string().uuid().optional().nullable(),
  saveAsTransferRule: z.string().optional(),
  transferRulePattern: z.string().max(200).optional(),
  saveAsRule: z.string().optional(),
  rulePattern: z.string().max(200).optional(),
});

export type MovementFormState =
  | { ok: false; errors: Record<string, string> }
  | { ok: true }
  | null;

function parseFormData(formData: FormData) {
  const raw = {
    date: String(formData.get("date") ?? ""),
    amount: String(formData.get("amount") ?? "").replace(",", "."),
    type: String(formData.get("type") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: (formData.get("categoryId") as string) || null,
    employeeId: (formData.get("employeeId") as string) || null,
    accountId: (formData.get("accountId") as string) || null,
    isTransfer: (formData.get("isTransfer") as string) || undefined,
    transferToAccountId: (formData.get("transferToAccountId") as string) || null,
    saveAsTransferRule: (formData.get("saveAsTransferRule") as string) || undefined,
    transferRulePattern: (formData.get("transferRulePattern") as string) || undefined,
    saveAsRule: (formData.get("saveAsRule") as string) || undefined,
    rulePattern: (formData.get("rulePattern") as string) || undefined,
  };
  return MovementSchema.safeParse(raw);
}

function toMovementInput(data: z.infer<typeof MovementSchema>) {
  const isTransfer = data.isTransfer === "on" || data.isTransfer === "true";
  return {
    date: new Date(data.date),
    amount: parseFloat(data.amount).toFixed(2),
    type: data.type,
    description: data.description,
    // Per trasferimenti: nessuna categoria/dipendente (sono solo movimentazione liquidità)
    categoryId: isTransfer ? null : data.categoryId || null,
    employeeId: isTransfer ? null : data.employeeId || null,
    accountId: data.accountId || null,
    isTransfer,
    transferToAccountId: isTransfer ? data.transferToAccountId || null : null,
  };
}

async function ensureAccount(input: ReturnType<typeof toMovementInput>) {
  if (input.accountId) return input;
  const primary = await getPrimaryAccount();
  return { ...input, accountId: primary?.id ?? null };
}

function flattenZodErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

async function applyCategoryRule(input: ReturnType<typeof toMovementInput>) {
  // Trasferimenti non hanno categoria di P&L
  if (input.isTransfer) return input;
  // Se l'utente ha già scelto una categoria, rispetta la sua scelta
  if (input.categoryId) return input;
  const rules = await getAllRulesForMatching();
  const match = findMatchingRule(input.description, input.type, rules);
  if (match) {
    await incrementMatchCount([match.ruleId]);
    return { ...input, categoryId: match.categoryId };
  }
  return input;
}

async function maybeCreateRule(
  data: z.infer<typeof MovementSchema>,
  movement: ReturnType<typeof toMovementInput>,
) {
  if (data.saveAsRule !== "on" && data.saveAsRule !== "true") return;
  if (!movement.categoryId) return;
  const pattern = (data.rulePattern || "").trim();
  if (pattern.length < 3) return; // pattern troppo corto sarebbe pericoloso
  try {
    await createRule({
      pattern,
      categoryId: movement.categoryId,
      movementType: movement.type,
    });
  } catch {
    // ignora errori (es. pattern duplicato)
  }
}

async function maybeCreateTransferRule(
  data: z.infer<typeof MovementSchema>,
  movement: ReturnType<typeof toMovementInput>,
) {
  if (data.saveAsTransferRule !== "on" && data.saveAsTransferRule !== "true") return;
  if (!movement.isTransfer || !movement.transferToAccountId) return;
  const pattern = (data.transferRulePattern || "").trim();
  if (pattern.length < 3) return;
  try {
    await createTransferRule({
      pattern,
      targetAccountId: movement.transferToAccountId,
      sourceAccountId: movement.accountId,
    });
  } catch {
    // ignora errori (es. pattern duplicato)
  }
}

export async function createMovementAction(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodErrors(parsed.error) };
  }
  const movement = await applyCategoryRule(await ensureAccount(toMovementInput(parsed.data)));
  await createMovement(movement);
  await maybeCreateRule(parsed.data, movement);
  await maybeCreateTransferRule(parsed.data, movement);

  revalidatePath("/movimenti");
  revalidatePath("/conti");
  revalidatePath("/");
  redirect("/movimenti");
}

export async function updateMovementAction(
  id: string,
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodErrors(parsed.error) };
  }
  const movement = await ensureAccount(toMovementInput(parsed.data));
  await updateMovement(id, movement);
  await maybeCreateRule(parsed.data, movement);
  await maybeCreateTransferRule(parsed.data, movement);

  revalidatePath("/movimenti");
  revalidatePath("/conti");
  revalidatePath("/");
  redirect("/movimenti");
}

/**
 * Variante inline di updateMovementAction: NON fa redirect, ritorna {ok}
 * così l'overlay client può chiudersi e fare router.refresh() da solo.
 */
export async function updateMovementInlineAction(
  id: string,
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodErrors(parsed.error) };
  }
  const movement = await ensureAccount(toMovementInput(parsed.data));
  await updateMovement(id, movement);
  await maybeCreateRule(parsed.data, movement);
  await maybeCreateTransferRule(parsed.data, movement);

  revalidatePath("/movimenti");
  revalidatePath("/conti");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteMovementAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteMovement(id);
  revalidatePath("/movimenti");
  revalidatePath("/");
}

// ===================================================================
// CREATE INLINE: nuovo movimento dal modal (campi essenziali)
// ===================================================================

const InlineCreateMovementSchema = z.object({
  date: z.string().min(1),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: "Importo deve essere un numero positivo",
  }),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1).max(500),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  isTransfer: z.boolean().optional(),
  transferToAccountId: z.string().uuid().nullable().optional(),
  saveAsRule: z.boolean().optional(),
  rulePattern: z.string().optional(),
});

export type InlineCreateMovementResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createMovementInlineAction(
  payload: unknown,
): Promise<InlineCreateMovementResult> {
  const parsed = InlineCreateMovementSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  try {
    // Conto: usa quello scelto o il principale
    let accountId = parsed.data.accountId ?? null;
    if (!accountId) {
      const primary = await getPrimaryAccount();
      accountId = primary?.id ?? null;
    }
    const isTransfer = parsed.data.isTransfer === true;
    const row = await createMovement({
      date: new Date(parsed.data.date),
      amount: parseFloat(parsed.data.amount).toFixed(2),
      type: parsed.data.type,
      description: parsed.data.description,
      categoryId: isTransfer ? null : parsed.data.categoryId ?? null,
      employeeId: isTransfer ? null : parsed.data.employeeId ?? null,
      accountId,
    });

    // Flag isTransfer + transferToAccountId via update (createMovement non li
    // accetta direttamente). Faccio update solo se isTransfer.
    if (isTransfer && parsed.data.transferToAccountId) {
      const { db } = await import("@/lib/db");
      const { movements } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(movements)
        .set({
          isTransfer: true,
          transferToAccountId: parsed.data.transferToAccountId,
          updatedAt: new Date(),
        })
        .where(eq(movements.id, row.id));
    }

    // Save as rule (categorization rule, solo se non transfer e c'è categoria)
    if (
      parsed.data.saveAsRule === true &&
      !isTransfer &&
      parsed.data.categoryId
    ) {
      const pattern = (parsed.data.rulePattern || "").trim();
      if (pattern.length >= 3) {
        try {
          await createRule({
            pattern,
            categoryId: parsed.data.categoryId,
            movementType: parsed.data.type,
          });
        } catch {
          // ignora duplicati
        }
      }
    }

    revalidatePath("/movimenti");
    revalidatePath("/conti");
    revalidatePath("/regole");
    revalidatePath("/");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

// ===================================================================
// QUICK UPDATE: cambia solo la categoria (inline edit nella lista)
// ===================================================================

const QuickCategorySchema = z.object({
  movementId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
});

export type ConflictingRule = {
  ruleId: string;
  pattern: string;
  currentCategoryId: string;
  currentCategoryName: string | null;
  /** Conto attuale movimenti che usano questa regola (esclusi quelli appena
   *  ri-categorizzati). Solo indicativo. */
  alsoAffectsCount: number;
};

export type QuickCategoryResult =
  | { ok: true; conflicts: ConflictingRule[] }
  | { ok: false; error: string };

export async function updateMovementCategoryAction(
  input: z.infer<typeof QuickCategorySchema>,
): Promise<QuickCategoryResult> {
  const parsed = QuickCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };
  try {
    const [
      { updateMovementCategory, getMovement },
      { logCategoryChange },
      { getCategory, listCategories },
      catRulesMod,
    ] = await Promise.all([
      import("@/lib/db/queries/movements"),
      import("@/lib/db/queries/category-change-log"),
      import("@/lib/db/queries/categories"),
      import("@/lib/db/queries/categorization-rules"),
    ]);

    // Leggi stato attuale per il log
    const before = await getMovement(parsed.data.movementId);
    if (!before) return { ok: false, error: "Movimento non trovato" };
    const fromCategoryId = before.categoryId ?? null;
    const [fromCat, toCat] = await Promise.all([
      fromCategoryId ? getCategory(fromCategoryId) : Promise.resolve(null),
      parsed.data.categoryId ? getCategory(parsed.data.categoryId) : Promise.resolve(null),
    ]);

    await updateMovementCategory(parsed.data.movementId, parsed.data.categoryId);
    await logCategoryChange({
      movementId: parsed.data.movementId,
      fromCategoryId,
      fromLabel: fromCat?.name ?? "Senza categoria",
      toCategoryId: parsed.data.categoryId,
      toLabel: toCat?.name ?? "Senza categoria",
      source: "inline",
    });

    // ===== CONFLICT DETECTION =====
    // Cerca regole che matchano questa descrizione MA puntano a una categoria
    // diversa da quella ora scelta dall'utente. Alla prossima sync re-categorizzerebbero.
    const conflicts: ConflictingRule[] = [];
    if (parsed.data.categoryId) {
      const allRules = await catRulesMod.getAllRulesForMatching();
      const desc = before.description.toLowerCase();
      const allCats = await listCategories();
      const catNameById = new Map(allCats.map((c) => [c.id, c.name]));
      const conflictingRules = allRules.filter((r) => {
        if (r.categoryId === parsed.data.categoryId) return false;
        if (r.movementType && r.movementType !== before.type) return false;
        return desc.includes(r.pattern);
      });
      // Per ogni regola conflittuale, conta quanti ALTRI movimenti la usano
      // (movimenti con quella categoryId e descrizione che matcha il pattern)
      for (const r of conflictingRules) {
        const { countMovementsForRule } = await import("@/lib/db/queries/categorization-rules");
        const alsoAffectsCount = await countMovementsForRule(r.pattern, r.categoryId, before.type);
        conflicts.push({
          ruleId: r.id,
          pattern: r.pattern,
          currentCategoryId: r.categoryId,
          currentCategoryName: catNameById.get(r.categoryId) ?? null,
          alsoAffectsCount,
        });
      }
    }

    revalidatePath("/movimenti");
    revalidatePath("/sincronizza");
    revalidatePath("/storico-cambiamenti");
    revalidatePath("/");
    return { ok: true, conflicts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

// ===================================================================
// Conflict actions: sposta regola o cancellala
// ===================================================================

const MoveRuleConflictSchema = z.object({
  ruleId: z.string().uuid(),
  newCategoryId: z.string().uuid(),
});

export type MoveRuleConflictResult =
  | { ok: true; alsoAffected: number }
  | { ok: false; error: string };

export async function moveConflictingRuleAction(
  input: z.infer<typeof MoveRuleConflictSchema>,
): Promise<MoveRuleConflictResult> {
  const parsed = MoveRuleConflictSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };
  try {
    const { moveRuleToCategory } = await import("@/lib/db/queries/categorization-rules");
    await moveRuleToCategory(parsed.data.ruleId, parsed.data.newCategoryId);
    revalidatePath("/movimenti");
    revalidatePath("/regole");
    return { ok: true, alsoAffected: 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

const DeleteRuleConflictSchema = z.object({ ruleId: z.string().uuid() });
export type DeleteRuleConflictResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteConflictingRuleAction(
  input: z.infer<typeof DeleteRuleConflictSchema>,
): Promise<DeleteRuleConflictResult> {
  const parsed = DeleteRuleConflictSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parametri non validi" };
  try {
    const { deleteRule } = await import("@/lib/db/queries/categorization-rules");
    await deleteRule(parsed.data.ruleId);
    revalidatePath("/movimenti");
    revalidatePath("/regole");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
