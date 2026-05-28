import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  categorizationRules,
  financialAccounts,
  movements,
  transferRules,
} from "@/lib/db/schema";
import { logCategoryChangesBulk, type LogChangeInput } from "./category-change-log";

export type ApplyRulesOptions = {
  /**
   * Se true, applica le regole anche ai movimenti GIÀ categorizzati / già
   * marcati come transfer (sovrascrive). Se false, applica solo a quelli
   * non categorizzati / categoria "Da rivedere" e non transfer.
   */
  overrideExisting: boolean;
};

export type MovementChangeExample = {
  id: string;
  description: string;
  amount: string;
  date: Date;
};

export type ChangeGroup = {
  /** Nome categoria origine ("Senza categoria" se NULL, "→ Conto X" se transfer) */
  fromLabel: string;
  /** Nome categoria destinazione */
  toLabel: string;
  /** Quante righe sono passate da from → to */
  count: number;
  /** Fino a 5 esempi di righe coinvolte (per UI) */
  examples: MovementChangeExample[];
};

export type ApplyRulesResult = {
  totalScanned: number;
  categorized: number;
  markedAsTransfer: number;
  movedToReview: number;
  unchanged: number;
  /** Aggregato dei cambiamenti effettivi per coppia (origine → destinazione). */
  changes: ChangeGroup[];
};

/**
 * Applica retroattivamente le regole di categorizzazione e transfer ai
 * movimenti esistenti.
 *
 * Logica per ogni movimento:
 *   1. Match contro transfer rules → se trovata, isTransfer=true,
 *      transferToAccountId=rule.target, categoryId=null
 *   2. Altrimenti match contro categorization rules → categoryId=rule.category
 *   3. Se nessuna regola matcha → assegna categoria "Da rivedere" (se esiste).
 *
 * Le regole hanno priorità (transfer prima di category): un movimento che
 * matcha entrambe diventa transfer (non viene categorizzato).
 *
 * Le `match_count` e `last_matched_at` delle regole usate vengono incrementate.
 */
export async function applyRulesToMovements(
  options: ApplyRulesOptions,
): Promise<ApplyRulesResult> {
  return db.transaction(async (tx) => {
    // (1) Carica tutte le regole una sola volta
    const allCatRules = await tx
      .select({
        id: categorizationRules.id,
        pattern: categorizationRules.pattern,
        categoryId: categorizationRules.categoryId,
        movementType: categorizationRules.movementType,
      })
      .from(categorizationRules);

    const allTransferRules = await tx
      .select({
        id: transferRules.id,
        pattern: transferRules.pattern,
        targetAccountId: transferRules.targetAccountId,
        sourceAccountId: transferRules.sourceAccountId,
      })
      .from(transferRules);

    // Lookup id della categoria "Da rivedere" (case-insensitive), per
    // assegnarla ai movimenti che non matchano nessuna regola.
    const [reviewCat] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(sql`LOWER(${categories.name}) = 'da rivedere'`)
      .limit(1);
    const reviewCategoryId: string | null = reviewCat?.id ?? null;

    if (allCatRules.length === 0 && allTransferRules.length === 0 && !reviewCategoryId) {
      return {
        totalScanned: 0,
        categorized: 0,
        markedAsTransfer: 0,
        movedToReview: 0,
        unchanged: 0,
        changes: [],
      };
    }

    // Lookup categorie / conti per i label nel report changes
    const allCategories = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories);
    const catName = new Map(allCategories.map((c) => [c.id, c.name]));
    const allAccounts = await tx
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts);
    const accName = new Map(allAccounts.map((a) => [a.id, a.name]));

    // (2) Carica i movimenti candidati con il loro stato attuale (per il
    // confronto old → new). Senza override consideriamo candidati anche quelli
    // con categoria "Da rivedere" (così cambieranno se ora c'è una regola che
    // matcha).
    const candidates = options.overrideExisting
      ? await tx
          .select({
            id: movements.id,
            description: movements.description,
            amount: movements.amount,
            date: movements.date,
            type: movements.type,
            accountId: movements.accountId,
            currentCategoryId: movements.categoryId,
            currentIsTransfer: movements.isTransfer,
            currentTransferToAccountId: movements.transferToAccountId,
          })
          .from(movements)
      : await tx
          .select({
            id: movements.id,
            description: movements.description,
            amount: movements.amount,
            date: movements.date,
            type: movements.type,
            accountId: movements.accountId,
            currentCategoryId: movements.categoryId,
            currentIsTransfer: movements.isTransfer,
            currentTransferToAccountId: movements.transferToAccountId,
          })
          .from(movements)
          .leftJoin(categories, eq(movements.categoryId, categories.id))
          .where(
            and(
              eq(movements.isTransfer, false),
              sql`(${movements.categoryId} IS NULL OR LOWER(${categories.name}) = 'da rivedere')`,
            ),
          );

    let categorized = 0;
    let markedAsTransfer = 0;
    let movedToReview = 0;
    let unchanged = 0;
    const usedCatRuleIds = new Set<string>();
    const usedTransferRuleIds = new Set<string>();

    // Per ridurre il numero di UPDATE, raggruppiamo i movimenti per
    // (categoryId, isTransfer, transferToAccountId) e facciamo update bulk.
    const catBuckets = new Map<string, string[]>(); // categoryId → movementIds
    const transferBuckets = new Map<string, string[]>(); // targetAccountId → movementIds
    const reviewBucket: string[] = []; // movimenti da assegnare a "Da rivedere"

    // Tracciamento changes per il report "old → new"
    type ChangeKey = string; // `${fromLabel}||${toLabel}`
    const changesMap = new Map<
      ChangeKey,
      { fromLabel: string; toLabel: string; count: number; examples: MovementChangeExample[] }
    >();
    // Log da scrivere su category_change_log (persistente)
    const logEntries: LogChangeInput[] = [];
    function labelFromCurrent(
      currentCategoryId: string | null,
      currentIsTransfer: boolean,
      currentTransferToAccountId: string | null,
    ): string {
      if (currentIsTransfer && currentTransferToAccountId) {
        return `→ ${accName.get(currentTransferToAccountId) ?? "Conto"}`;
      }
      if (!currentCategoryId) return "Senza categoria";
      return catName.get(currentCategoryId) ?? "(eliminata)";
    }
    function recordChange(
      fromLabel: string,
      toLabel: string,
      example: MovementChangeExample,
      fromCategoryId: string | null,
      toCategoryId: string | null,
    ) {
      if (fromLabel === toLabel) return;
      const key = `${fromLabel}||${toLabel}`;
      const existing = changesMap.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.examples.length < 5) existing.examples.push(example);
      } else {
        changesMap.set(key, {
          fromLabel,
          toLabel,
          count: 1,
          examples: [example],
        });
      }
      logEntries.push({
        movementId: example.id,
        fromCategoryId,
        fromLabel,
        toCategoryId,
        toLabel,
        source: "sync",
      });
    }

    for (const m of candidates) {
      const desc = m.description.toLowerCase();
      const fromLabel = labelFromCurrent(
        m.currentCategoryId,
        m.currentIsTransfer,
        m.currentTransferToAccountId,
      );
      const example: MovementChangeExample = {
        id: m.id,
        description: m.description,
        amount: m.amount,
        date: m.date,
      };

      // (a) Transfer rules prima
      let transferMatch: { ruleId: string; targetAccountId: string } | null = null;
      for (const r of allTransferRules) {
        if (r.sourceAccountId && r.sourceAccountId !== m.accountId) continue;
        if (desc.includes(r.pattern)) {
          transferMatch = { ruleId: r.id, targetAccountId: r.targetAccountId };
          break;
        }
      }

      if (transferMatch) {
        const key = transferMatch.targetAccountId;
        if (!transferBuckets.has(key)) transferBuckets.set(key, []);
        transferBuckets.get(key)!.push(m.id);
        usedTransferRuleIds.add(transferMatch.ruleId);
        markedAsTransfer += 1;
        recordChange(
          fromLabel,
          `→ ${accName.get(transferMatch.targetAccountId) ?? "Conto"}`,
          example,
          m.currentCategoryId,
          null,
        );
        continue;
      }

      // (b) Category rules
      let catMatch: { ruleId: string; categoryId: string } | null = null;
      for (const r of allCatRules) {
        if (r.movementType && r.movementType !== m.type) continue;
        if (desc.includes(r.pattern)) {
          catMatch = { ruleId: r.id, categoryId: r.categoryId };
          break;
        }
      }

      if (catMatch) {
        const key = catMatch.categoryId;
        if (!catBuckets.has(key)) catBuckets.set(key, []);
        catBuckets.get(key)!.push(m.id);
        usedCatRuleIds.add(catMatch.ruleId);
        categorized += 1;
        recordChange(
          fromLabel,
          catName.get(catMatch.categoryId) ?? "(?)",
          example,
          m.currentCategoryId,
          catMatch.categoryId,
        );
      } else if (reviewCategoryId) {
        // (c) Nessun match → assegna a "Da rivedere" (inbox di triage)
        reviewBucket.push(m.id);
        movedToReview += 1;
        recordChange(
          fromLabel,
          catName.get(reviewCategoryId) ?? "Da rivedere",
          example,
          m.currentCategoryId,
          reviewCategoryId,
        );
      } else {
        unchanged += 1;
      }
    }

    // (3) Esegui UPDATE bulk: una query per bucket
    for (const [categoryId, ids] of catBuckets) {
      // chunk per evitare query troppo grandi
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await tx
          .update(movements)
          .set({
            categoryId,
            isTransfer: false,
            transferToAccountId: null,
            updatedAt: new Date(),
          })
          .where(inArray(movements.id, ids.slice(i, i + CHUNK)));
      }
    }

    for (const [targetAccountId, ids] of transferBuckets) {
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await tx
          .update(movements)
          .set({
            isTransfer: true,
            transferToAccountId: targetAccountId,
            categoryId: null,
            updatedAt: new Date(),
          })
          .where(inArray(movements.id, ids.slice(i, i + CHUNK)));
      }
    }

    // Bucket "Da rivedere"
    if (reviewBucket.length > 0 && reviewCategoryId) {
      const CHUNK = 500;
      for (let i = 0; i < reviewBucket.length; i += CHUNK) {
        await tx
          .update(movements)
          .set({
            categoryId: reviewCategoryId,
            isTransfer: false,
            transferToAccountId: null,
            updatedAt: new Date(),
          })
          .where(inArray(movements.id, reviewBucket.slice(i, i + CHUNK)));
      }
    }

    // (4) Incrementa match_count delle regole usate
    if (usedCatRuleIds.size > 0) {
      await tx
        .update(categorizationRules)
        .set({
          matchCount: sql`${categorizationRules.matchCount} + 1`,
          lastMatchedAt: new Date(),
        })
        .where(inArray(categorizationRules.id, Array.from(usedCatRuleIds)));
    }
    if (usedTransferRuleIds.size > 0) {
      await tx
        .update(transferRules)
        .set({
          matchCount: sql`${transferRules.matchCount} + 1`,
          lastMatchedAt: new Date(),
        })
        .where(inArray(transferRules.id, Array.from(usedTransferRuleIds)));
    }

    // Persisti tutti i change log nella stessa transazione
    if (logEntries.length > 0) {
      await logCategoryChangesBulk(logEntries, tx);
    }

    const changes: ChangeGroup[] = Array.from(changesMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      totalScanned: candidates.length,
      categorized,
      markedAsTransfer,
      movedToReview,
      unchanged,
      changes,
    };
  });
}
