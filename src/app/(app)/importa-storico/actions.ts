"use server";

import { revalidatePath } from "next/cache";
import readXlsxFile from "read-excel-file/node";
import { Readable } from "node:stream";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, categorizationRules, movements } from "@/lib/db/schema";
import { listCategories } from "@/lib/db/queries/categories";
import { getPrimaryAccount, listAccounts } from "@/lib/db/queries/financial-accounts";
import {
  buildCategoryProposals,
  buildRawToCanonicalMap,
  extractCuratedRuleProposals,
  extractRuleProposals,
  mergeRuleProposals,
  parseStoricoSheets,
  type CategoryProposal,
  type RuleProposal,
  type StoricoRawRow,
} from "@/lib/storico-analyzer";

// ===================================================================
// ANALYZE
// ===================================================================

export type AnalyzeStoricoResult =
  | {
      ok: true;
      totalRows: number;
      sheetsCount: number;
      errors: Array<{ sheet: string; rowIndex: number; reason: string }>;
      categoryProposals: CategoryProposal[];
      ruleProposals: RuleProposal[];
      existingCategories: Array<{ id: string; name: string; type: "income" | "expense" }>;
      accounts: Array<{ id: string; name: string; type: string; isPrimary: boolean }>;
      defaultAccountId: string | null;
    }
  | { ok: false; error: string };

/**
 * readXlsxFile/node senza opzioni ritorna direttamente un array `Sheet[]`,
 * dove ogni Sheet è `{ sheet: string; data: unknown[][] }`.
 */
async function readAllSheets(
  file: File,
): Promise<Array<{ sheet: string; data: unknown[][] }> | null> {
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buf);
    const sheets = (await readXlsxFile(stream)) as unknown;
    if (!Array.isArray(sheets) || sheets.length === 0) return null;
    return sheets as Array<{ sheet: string; data: unknown[][] }>;
  } catch (e) {
    console.error("[importa-storico] errore parsing Excel:", e);
    return null;
  }
}

export async function analyzeStoricoAction(formData: FormData): Promise<AnalyzeStoricoResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nessun file caricato" };
  }

  const sheets = await readAllSheets(file);
  if (!sheets || sheets.length === 0) {
    return { ok: false, error: "Impossibile leggere il file Excel" };
  }

  const parsed = parseStoricoSheets(sheets);
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: "Nessuna riga valida trovata. Verifica che il file abbia la struttura attesa (Tipologia, Data, Descrizione, Accrediti/Addebiti, Descrizione estesa).",
    };
  }

  const existingCategories = await listCategories();
  const categoryProposals = buildCategoryProposals(parsed.rows, existingCategories);

  const rawToCanonical = buildRawToCanonicalMap(categoryProposals);
  const curatedRules = extractCuratedRuleProposals(parsed.rows);
  const statisticalRules = extractRuleProposals(parsed.rows, rawToCanonical, {
    minCoverage: 3,
    minReliability: 0.75,
  });
  const ruleProposals = mergeRuleProposals(curatedRules, statisticalRules);

  const accounts = await listAccounts({ activeOnly: false });
  const primary = await getPrimaryAccount();

  return {
    ok: true,
    totalRows: parsed.rows.length,
    sheetsCount: sheets.length,
    errors: parsed.errors,
    categoryProposals,
    ruleProposals,
    existingCategories,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      isPrimary: a.isPrimary,
    })),
    defaultAccountId: primary?.id ?? null,
  };
}

// ===================================================================
// CONFIRM
// ===================================================================

const CategoryDecisionSchema = z.object({
  /** Identificatore stabile lato client (per mappare back i raw names) */
  key: z.string(),
  /** Nome canonico finale scelto dall'utente */
  canonical: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Lista dei nomi raw (così come nel file) fusi in questa categoria */
  rawNames: z.array(z.string()),
  /** Se l'utente vuole riusare una categoria già esistente nel DB */
  existingCategoryId: z.string().uuid().nullable(),
  /** Se l'utente vuole escludere completamente queste righe dall'import */
  skip: z.boolean(),
});

const RuleDecisionSchema = z.object({
  pattern: z.string().min(1).max(200),
  movementType: z.enum(["income", "expense"]),
  /** Canonical scelto dall'utente per questa regola (può differire da quella suggerita) */
  targetCanonical: z.string().min(1).max(100),
  enabled: z.boolean(),
});

const ConfirmMetadataSchema = z.object({
  accountId: z.string().uuid(),
  categories: z.array(CategoryDecisionSchema),
  rules: z.array(RuleDecisionSchema),
});

export type ConfirmStoricoResult =
  | {
      ok: true;
      insertedMovements: number;
      createdCategories: number;
      createdRules: number;
      skippedRows: number;
    }
  | { ok: false; error: string };

export async function confirmStoricoImportAction(
  formData: FormData,
): Promise<ConfirmStoricoResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "File mancante. Ricarica e riprova." };
  }
  const metadataRaw = formData.get("metadata");
  if (typeof metadataRaw !== "string") {
    return { ok: false, error: "Metadati mancanti" };
  }

  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metadataRaw);
  } catch {
    return { ok: false, error: "Metadati non parsabili" };
  }
  const parsedMeta = ConfirmMetadataSchema.safeParse(metaJson);
  if (!parsedMeta.success) {
    return {
      ok: false,
      error: `Metadati non validi: ${parsedMeta.error.issues[0]?.message ?? ""}`,
    };
  }

  const sheets = await readAllSheets(file);
  if (!sheets || sheets.length === 0) {
    return { ok: false, error: "Impossibile rileggere il file Excel" };
  }
  const parsed = parseStoricoSheets(sheets);
  if (parsed.rows.length === 0) {
    return { ok: false, error: "Nessuna riga valida nel file" };
  }

  const meta = parsedMeta.data;

  // Mappa rawCategoryName → CategoryDecision
  const rawToDecision = new Map<string, z.infer<typeof CategoryDecisionSchema>>();
  for (const d of meta.categories) {
    for (const raw of d.rawNames) {
      rawToDecision.set(raw, d);
    }
  }

  // Filtra righe: salta quelle di categorie marcate "skip" o non mappate
  const rowsToInsert: StoricoRawRow[] = [];
  let skippedRows = 0;
  for (const r of parsed.rows) {
    const dec = rawToDecision.get(r.rawCategory);
    if (!dec || dec.skip) {
      skippedRows += 1;
      continue;
    }
    rowsToInsert.push(r);
  }

  if (rowsToInsert.length === 0) {
    return { ok: false, error: "Nessuna riga da importare dopo l'esclusione" };
  }

  // Carica categorie esistenti per dedup
  const existing = await listCategories();
  const existingByLowerName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  try {
    const result = await db.transaction(async (tx) => {
      // (1) Crea categorie nuove. Mappa canonicalName → categoryId
      const canonicalToId = new Map<string, string>();
      let createdCategories = 0;

      for (const dec of meta.categories) {
        if (dec.skip) continue;
        if (dec.existingCategoryId) {
          canonicalToId.set(dec.canonical, dec.existingCategoryId);
          continue;
        }
        const existingMatch = existingByLowerName.get(dec.canonical.toLowerCase());
        if (existingMatch) {
          canonicalToId.set(dec.canonical, existingMatch.id);
          continue;
        }
        const [row] = await tx
          .insert(categories)
          .values({
            name: dec.canonical,
            type: dec.type,
            color: dec.color,
          })
          .returning();
        canonicalToId.set(dec.canonical, row.id);
        existingByLowerName.set(dec.canonical.toLowerCase(), row);
        createdCategories += 1;
      }

      // Per le regole può anche esserci un targetCanonical NON presente nelle
      // category decisions (es. utente sceglie nuova categoria "Ristoranti" per
      // un pattern "deliveroo" anche se il file aveva quei movimenti come
      // "Trasferte"). In quel caso creiamo la categoria al volo (tipo = quello
      // della regola).
      for (const rule of meta.rules) {
        if (!rule.enabled) continue;
        if (canonicalToId.has(rule.targetCanonical)) continue;
        const existingMatch = existingByLowerName.get(rule.targetCanonical.toLowerCase());
        if (existingMatch) {
          canonicalToId.set(rule.targetCanonical, existingMatch.id);
          continue;
        }
        const [row] = await tx
          .insert(categories)
          .values({
            name: rule.targetCanonical,
            type: rule.movementType,
            color: "#6b7280",
          })
          .returning();
        canonicalToId.set(rule.targetCanonical, row.id);
        existingByLowerName.set(rule.targetCanonical.toLowerCase(), row);
        createdCategories += 1;
      }

      // (2) Crea le regole abilitate (dedup contro pattern+categoria esistente)
      let createdRules = 0;
      for (const rule of meta.rules) {
        if (!rule.enabled) continue;
        const catId = canonicalToId.get(rule.targetCanonical);
        if (!catId) continue;
        const normalized = rule.pattern.trim().toLowerCase();
        if (!normalized) continue;

        // Dedup
        const [existingRule] = await tx
          .select({ id: categorizationRules.id })
          .from(categorizationRules)
          .where(
            and(
              sql`LOWER(${categorizationRules.pattern}) = ${normalized}`,
              eq(categorizationRules.categoryId, catId),
            ),
          )
          .limit(1);
        if (existingRule) continue;

        await tx.insert(categorizationRules).values({
          pattern: normalized,
          categoryId: catId,
          movementType: rule.movementType,
        });
        createdRules += 1;
      }

      // (3) Inserisci i movimenti. Per ogni riga:
      //     - se matcha una regola abilitata, usa la categoria della regola
      //     - altrimenti usa la categoria dalla CategoryDecision (raw → canonical)
      const enabledRules = meta.rules
        .filter((r) => r.enabled)
        .map((r) => ({
          pattern: r.pattern.toLowerCase(),
          targetCanonical: r.targetCanonical,
          movementType: r.movementType,
        }));

      const values = rowsToInsert.map((r) => {
        const dec = rawToDecision.get(r.rawCategory)!;
        let categoryId: string | null = canonicalToId.get(dec.canonical) ?? null;

        // Match contro le regole (descrizione + descrizione estesa)
        const haystack =
          `${r.description} ${r.descriptionExt}`.toLowerCase();
        for (const rule of enabledRules) {
          if (rule.movementType !== r.type) continue;
          if (haystack.includes(rule.pattern)) {
            const ruleCatId = canonicalToId.get(rule.targetCanonical);
            if (ruleCatId) {
              categoryId = ruleCatId;
              break;
            }
          }
        }

        const desc = r.descriptionExt
          ? `${r.description} — ${r.descriptionExt}`
          : r.description;

        return {
          date: r.date,
          amount: r.amount.toFixed(2),
          type: r.type,
          description: desc,
          categoryId,
          accountId: meta.accountId,
        };
      });

      const CHUNK = 500;
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(movements).values(values.slice(i, i + CHUNK));
      }

      return {
        createdCategories,
        createdRules,
        insertedMovements: values.length,
      };
    });

    revalidatePath("/movimenti");
    revalidatePath("/categorie");
    revalidatePath("/conti");
    revalidatePath("/");

    return {
      ok: true,
      insertedMovements: result.insertedMovements,
      createdCategories: result.createdCategories,
      createdRules: result.createdRules,
      skippedRows,
    };
  } catch (e) {
    console.error("[importa-storico] errore transazione:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore durante l'inserimento",
    };
  }
}
