"use server";

import { revalidatePath } from "next/cache";
import readXlsxFile from "read-excel-file/node";
import { Readable } from "node:stream";
import { z } from "zod";
import { db } from "@/lib/db";
import { movements } from "@/lib/db/schema";
import { analyzeExcelSample, ImportPlanSchema, type ImportPlan } from "@/lib/excel-ai-detector";
import { applyImportPlan } from "@/lib/excel-apply-plan";
import {
  getAllRulesForMatching,
  findMatchingRule,
  incrementMatchCount,
} from "@/lib/db/queries/categorization-rules";
import { listCategories } from "@/lib/db/queries/categories";
import { getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { normalizeBankDescription } from "@/lib/description-normalizer";
import { computeMovementHash, movementSignature } from "@/lib/movement-hash";

export type AnalyzeResult =
  | {
      ok: true;
      plan: ImportPlan;
      valid: Array<{
        sourceRowIndex: number;
        date: string; // ISO
        amount: number;
        type: "income" | "expense";
        description: string;
        currency: string;
        suggestedCategoryId: string | null;
        suggestedCategoryName: string | null;
        suggestedFromRule: boolean;
      }>;
      errors: Array<{ sourceRowIndex: number; error: string; raw: string[] }>;
      filtered: number;
      totalRows: number;
      headerRow: string[];
      cost: { eur: number; tokens: number };
      rulesCount: number;
    }
  | { ok: false; error: string };

async function readFileToRows(file: File): Promise<unknown[][] | null> {
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buf);
    const sheets = (await readXlsxFile(stream)) as unknown;
    // readXlsxFile node ritorna { sheet, data }[] o direttamente matrice secondo il file
    if (Array.isArray(sheets) && sheets.length > 0) {
      const first = sheets[0] as unknown;
      if (first && typeof first === "object" && "data" in (first as object)) {
        const sheet = first as { data: unknown[][] };
        return sheet.data;
      }
      return sheets as unknown[][];
    }
    return null;
  } catch {
    return null;
  }
}

export async function analyzeExcelAction(formData: FormData): Promise<AnalyzeResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nessun file caricato" };
  }

  const rows = await readFileToRows(file);
  if (!rows || rows.length === 0) {
    return { ok: false, error: "Il file è vuoto o non leggibile come Excel" };
  }

  // Sample: prime 50 righe
  const sample = rows.slice(0, 50).map((row) =>
    row.map((c) => {
      if (c == null) return "";
      if (c instanceof Date) {
        const dd = String(c.getUTCDate()).padStart(2, "0");
        const mm = String(c.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = c.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
      return String(c);
    }),
  );

  const aiResult = await analyzeExcelSample(sample);
  if (!aiResult.ok) return { ok: false, error: aiResult.error };

  const plan = aiResult.plan;
  const applied = applyImportPlan(rows, plan);

  // Estrai header per UI
  const headerRowRaw = rows[plan.headerRowIndex] ?? [];
  const headerRow = headerRowRaw.map((c) => (c == null ? "" : String(c)));

  // Carica regole esistenti + categorie per pre-categorizzare la preview
  const [allRules, allCategories] = await Promise.all([
    getAllRulesForMatching(),
    listCategories(),
  ]);
  const categoryMap = new Map(allCategories.map((c) => [c.id, c.name]));

  return {
    ok: true,
    plan,
    valid: applied.valid.map((v) => {
      const match = findMatchingRule(v.description, v.type, allRules);
      return {
        sourceRowIndex: v.sourceRowIndex,
        date: v.date.toISOString(),
        amount: v.amount,
        type: v.type,
        description: v.description,
        currency: v.currency,
        suggestedCategoryId: match?.categoryId ?? null,
        suggestedCategoryName: match ? (categoryMap.get(match.categoryId) ?? null) : null,
        suggestedFromRule: match !== null,
      };
    }),
    errors: applied.errors,
    filtered: applied.filtered,
    totalRows: rows.length,
    headerRow,
    cost: { eur: aiResult.cost.eur, tokens: aiResult.cost.inputTokens + aiResult.cost.outputTokens },
    rulesCount: allRules.length,
  };
}

// ============================================================
// CONFERMA IMPORT
// ============================================================

const ConfirmMetadataSchema = z.object({
  plan: ImportPlanSchema,
  excludedSourceRowIndexes: z.array(z.number().int().nonnegative()).default([]),
  defaultIncomeCategoryId: z.string().nullable().optional(),
  defaultExpenseCategoryId: z.string().nullable().optional(),
  // Conto a cui assegnare tutti i movimenti importati. Se null/omesso, usa il conto principale.
  accountId: z.string().uuid().nullable().optional(),
  // Override per riga: sourceRowIndex → categoryId (o null per nessuna categoria)
  manualCategories: z.record(z.string(), z.string().nullable()).default({}),
});

export type ConfirmResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

export async function confirmExcelImportAction(formData: FormData): Promise<ConfirmResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "File mancante. Ricarica e riprova." };
  }
  const metadataRaw = formData.get("metadata");
  if (typeof metadataRaw !== "string") {
    return { ok: false, error: "Metadati mancanti" };
  }

  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(metadataRaw);
  } catch {
    return { ok: false, error: "Metadati non parsabili" };
  }

  const parsed = ConfirmMetadataSchema.safeParse(metadataJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Metadati non validi: ${parsed.error.issues[0]?.message ?? ""}`,
    };
  }

  const rows = await readFileToRows(file);
  if (!rows || rows.length === 0) {
    return { ok: false, error: "Impossibile rileggere il file Excel" };
  }

  const applied = applyImportPlan(rows, parsed.data.plan);
  const excludedSet = new Set(parsed.data.excludedSourceRowIndexes);
  const toInsert = applied.valid.filter((r) => !excludedSet.has(r.sourceRowIndex));

  if (toInsert.length === 0) {
    return { ok: false, error: "Nessuna riga da importare" };
  }

  const allRules = await getAllRulesForMatching();
  const matchedRuleIds: string[] = [];

  // Determina il conto di destinazione: scelto dall'utente o conto principale di default
  let targetAccountId = parsed.data.accountId ?? null;
  if (!targetAccountId) {
    const primary = await getPrimaryAccount();
    targetAccountId = primary?.id ?? null;
  }

  const manualCategories = parsed.data.manualCategories;
  const seenInBatch = new Map<string, number>();
  let insertedCount = 0;
  try {
    await db.transaction(async (tx) => {
      const values = toInsert.map((r) => {
        const idxKey = String(r.sourceRowIndex);
        let categoryId: string | null = null;
        const hasManualOverride = Object.prototype.hasOwnProperty.call(
          manualCategories,
          idxKey,
        );

        if (hasManualOverride) {
          categoryId = manualCategories[idxKey];
        } else {
          const matched = findMatchingRule(r.description, r.type, allRules);
          const fallback =
            r.type === "income"
              ? parsed.data.defaultIncomeCategoryId ?? null
              : parsed.data.defaultExpenseCategoryId ?? null;
          categoryId = matched ? matched.categoryId : fallback;
          if (matched) matchedRuleIds.push(matched.ruleId);
        }

        const amount = r.amount.toFixed(2);
        const sig = movementSignature({
          accountId: targetAccountId,
          date: r.date,
          amount,
          type: r.type,
          description: r.description,
        });
        const occurrenceIndex = seenInBatch.get(sig) ?? 0;
        seenInBatch.set(sig, occurrenceIndex + 1);
        const uniqueHash = computeMovementHash({
          accountId: targetAccountId,
          date: r.date,
          amount,
          type: r.type,
          description: r.description,
          occurrenceIndex,
        });

        const norm = normalizeBankDescription(r.description);
        return {
          date: r.date,
          amount,
          type: r.type,
          description: r.description,
          descriptionClean: norm.changed ? norm.clean : null,
          categoryId,
          accountId: targetAccountId,
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
    });
    if (matchedRuleIds.length > 0) {
      await incrementMatchCount([...new Set(matchedRuleIds)]);
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore durante l'inserimento",
    };
  }

  revalidatePath("/movimenti");
  revalidatePath("/conti");
  revalidatePath("/");

  return {
    ok: true,
    inserted: insertedCount,
    skipped: toInsert.length - insertedCount,
  };
}
