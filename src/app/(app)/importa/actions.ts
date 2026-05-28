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
  | { ok: true; inserted: number }
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

  try {
    await db.transaction(async (tx) => {
      const values = rows.map((r) => {
        // Auto-detect trasferimento
        const transferMatch = findMatchingTransferRule(
          r.description,
          targetAccountId,
          allTransferRules,
        );
        if (transferMatch) {
          matchedTransferRuleIds.push(transferMatch.ruleId);
          return {
            date: new Date(r.date),
            amount: r.amount.toFixed(2),
            type: r.type,
            description: r.description,
            categoryId: null,
            accountId: targetAccountId,
            isTransfer: true,
            transferToAccountId: transferMatch.targetAccountId,
          };
        }

        const matched = findMatchingRule(r.description, r.type, allRules);
        const fallback =
          r.type === "income"
            ? defaultIncomeCategoryId ?? null
            : defaultExpenseCategoryId ?? null;
        const categoryId = matched ? matched.categoryId : fallback;
        if (matched) matchedRuleIds.push(matched.ruleId);
        return {
          date: new Date(r.date),
          amount: r.amount.toFixed(2),
          type: r.type,
          description: r.description,
          categoryId,
          accountId: targetAccountId,
          isTransfer: false,
          transferToAccountId: null,
        };
      });

      const CHUNK = 500;
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(movements).values(values.slice(i, i + CHUNK));
      }
    });
    if (matchedRuleIds.length > 0) {
      await incrementMatchCount([...new Set(matchedRuleIds)]);
    }
    if (matchedTransferRuleIds.length > 0) {
      await incrementTransferMatchCount([...new Set(matchedTransferRuleIds)]);
    }

    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true, inserted: rows.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore durante l'inserimento",
    };
  }
}
