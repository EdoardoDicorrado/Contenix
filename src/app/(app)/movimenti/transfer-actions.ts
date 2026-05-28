"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { movements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTransferRule } from "@/lib/db/queries/transfer-rules";

const MarkSchema = z.object({
  movementId: z.string().uuid(),
  targetAccountId: z.string().uuid("Conto di destinazione obbligatorio"),
  saveAsRule: z.string().optional(),
  rulePattern: z.string().max(200).optional(),
});

export type TransferActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function markAsTransferAction(
  formData: FormData,
): Promise<TransferActionResult> {
  const parsed = MarkSchema.safeParse({
    movementId: formData.get("movementId"),
    targetAccountId: formData.get("targetAccountId"),
    saveAsRule: (formData.get("saveAsRule") as string) || undefined,
    rulePattern: (formData.get("rulePattern") as string) || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi",
    };
  }

  // Recupera il movimento per source_account_id
  const [movement] = await db
    .select({
      id: movements.id,
      accountId: movements.accountId,
      description: movements.description,
    })
    .from(movements)
    .where(eq(movements.id, parsed.data.movementId))
    .limit(1);

  if (!movement) return { ok: false, error: "Movimento non trovato" };

  if (movement.accountId === parsed.data.targetAccountId) {
    return {
      ok: false,
      error: "Il conto di destinazione non può coincidere con quello sorgente",
    };
  }

  // 1) Marca il movimento come trasferimento
  await db
    .update(movements)
    .set({
      isTransfer: true,
      transferToAccountId: parsed.data.targetAccountId,
      // Rimuovi categoria: un trasferimento non ha categoria di P&L
      categoryId: null,
      updatedAt: new Date(),
    })
    .where(eq(movements.id, parsed.data.movementId));

  // 2) Se richiesto, crea la regola per applicare automaticamente in futuro
  if (parsed.data.saveAsRule === "on" || parsed.data.saveAsRule === "true") {
    const pattern = (parsed.data.rulePattern || "").trim();
    if (pattern.length >= 3) {
      try {
        await createTransferRule({
          pattern,
          targetAccountId: parsed.data.targetAccountId,
          sourceAccountId: movement.accountId ?? null,
        });
      } catch {
        // Ignora errori di duplicato o pattern troppo corto
      }
    }
  }

  revalidatePath("/movimenti");
  revalidatePath(`/movimenti/${parsed.data.movementId}/modifica`);
  revalidatePath("/conti");
  revalidatePath("/");

  return { ok: true };
}

export async function unmarkAsTransferAction(
  formData: FormData,
): Promise<TransferActionResult> {
  const movementId = String(formData.get("movementId") ?? "");
  if (!movementId) return { ok: false, error: "ID movimento mancante" };

  await db
    .update(movements)
    .set({
      isTransfer: false,
      transferToAccountId: null,
      updatedAt: new Date(),
    })
    .where(eq(movements.id, movementId));

  revalidatePath("/movimenti");
  revalidatePath(`/movimenti/${movementId}/modifica`);
  revalidatePath("/conti");
  revalidatePath("/");

  return { ok: true };
}

export async function deleteTransferRuleAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { deleteTransferRule } = await import("@/lib/db/queries/transfer-rules");
  await deleteTransferRule(id);
  revalidatePath("/categorie");
  revalidatePath("/movimenti");
}
