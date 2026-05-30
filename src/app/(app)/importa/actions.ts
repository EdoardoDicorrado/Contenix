"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { movements } from "@/lib/db/schema";
import {
  getAllRulesForMatching,
  findMatchingRule,
  incrementMatchCount,
} from "@/lib/db/queries/categorization-rules";
import {
  getAllTransferRulesForMatching,
  findMatchingTransferRule,
  incrementTransferMatchCount,
} from "@/lib/db/queries/transfer-rules";
import { getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { normalizeBankDescription } from "@/lib/description-normalizer";
import { computeMovementHash, movementSignature } from "@/lib/movement-hash";

const RowSchema = z.object({
  date: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1).max(500),
});

const PayloadSchema = z.object({
  rows: z.array(RowSchema).min(1).max(5000),
  defaultIncomeCategoryId: z.string().nullable().optional(),
  defaultExpenseCategoryId: z.string().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
});

export type ImportResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

export async function importMovementsAction(
  payload: unknown,
): Promise<ImportResult> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Dati di import non validi" };
  }
  const { rows, defaultIncomeCategoryId, defaultExpenseCategoryId, accountId } =
    parsed.data;

  // Determina conto destinazione (override o primary)
  let targetAccountId = accountId ?? null;
  if (!targetAccountId) {
    const primary = await getPrimaryAccount();
    targetAccountId = primary?.id ?? null;
  }

  // Carica le regole una sola volta per applicarle in memoria
  const [allRules, allTransferRules] = await Promise.all([
    getAllRulesForMatching(),
    getAllTransferRulesForMatching(),
  ]);
  const matchedRuleIds: string[] = [];
  const matchedTransferRuleIds: string[] = [];

  // Counter posizionale per dedup: per ogni signature, traccia quanti
  // movimenti identici (per quel batch) sono stati visti finora → occurrenceIndex
  const seenInBatch = new Map<string, number>();

  let insertedCount = 0;
  let skippedCount = 0;
  try {
    await db.transaction(async (tx) => {
      const values = rows.map((r) => {
        const date = new Date(r.date);
        const amount = r.amount.toFixed(2);
        const sig = movementSignature({
          accountId: targetAccountId,
          date,
          amount,
          type: r.type,
          description: r.description,
        });
        const occurrenceIndex = seenInBatch.get(sig) ?? 0;
        seenInBatch.set(sig, occurrenceIndex + 1);
        const uniqueHash = computeMovementHash({
          accountId: targetAccountId,
          date,
          amount,
          type: r.type,
          description: r.description,
          occurrenceIndex,
        });

        // Auto-detect trasferimento
        const transferMatch = findMatchingTransferRule(
          r.description,
          targetAccountId,
          allTransferRules,
        );
        if (transferMatch) {
          matchedTransferRuleIds.push(transferMatch.ruleId);
          return {
            date,
            amount,
            type: r.type,
            description: r.description,
            categoryId: null,
            accountId: targetAccountId,
            isTransfer: true,
            transferToAccountId: transferMatch.targetAccountId,
            uniqueHash,
          };
        }

        const matched = findMatchingRule(r.description, r.type, allRules);
        const fallback =
          r.type === "income"
            ? defaultIncomeCategoryId ?? null
            : defaultExpenseCategoryId ?? null;
        const categoryId = matched ? matched.categoryId : fallback;
        if (matched) matchedRuleIds.push(matched.ruleId);
        const norm = normalizeBankDescription(r.description);
        return {
          date,
          amount,
          type: r.type,
          description: r.description,
          descriptionClean: norm.changed ? norm.clean : null,
          categoryId,
          accountId: targetAccountId,
          isTransfer: false,
          transferToAccountId: null,
          uniqueHash,
        };
      });

      const CHUNK = 500;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        const result = await tx
          .insert(movements)
          .values(chunk)
          .onConflictDoNothing({ target: movements.uniqueHash })
          .returning({ id: movements.id });
        insertedCount += result.length;
      }
      skippedCount = rows.length - insertedCount;
    });
    if (matchedRuleIds.length > 0) {
      await incrementMatchCount([...new Set(matchedRuleIds)]);
    }
    if (matchedTransferRuleIds.length > 0) {
      await incrementTransferMatchCount([...new Set(matchedTransferRuleIds)]);
    }

    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true, inserted: insertedCount, skipped: skippedCount };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore durante l'inserimento",
    };
  }
}
