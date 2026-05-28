// Esegue seed + apply rules direttamente sul DB senza passare per la UI.
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import ws from "ws";
import {
  categories,
  categorizationRules,
  movements,
  transferRules,
} from "../src/lib/db/schema";
import {
  RECOMMENDED_TAXONOMY,
  VENDOR_RULES,
} from "../src/lib/storico-knowledge";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function seed() {
  return db.transaction(async (tx) => {
    let createdCategories = 0;
    let skippedCategories = 0;
    let createdRules = 0;
    let skippedRules = 0;
    const canonicalToId = new Map<string, string>();

    for (const entry of RECOMMENDED_TAXONOMY) {
      const [existing] = await tx
        .select({ id: categories.id })
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
        .values({ name: entry.name, type: entry.type, color: entry.color })
        .returning({ id: categories.id });
      canonicalToId.set(entry.name, row.id);
      createdCategories += 1;
    }

    for (const rule of VENDOR_RULES) {
      const catId = canonicalToId.get(rule.categoryCanonical);
      if (!catId) continue;
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

    return { createdCategories, skippedCategories, createdRules, skippedRules };
  });
}

async function apply() {
  return db.transaction(async (tx) => {
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

    // OVERRIDE=true: scansiona tutti
    const candidates = await tx
      .select({
        id: movements.id,
        description: movements.description,
        type: movements.type,
        accountId: movements.accountId,
        currentCategoryId: movements.categoryId,
        currentIsTransfer: movements.isTransfer,
      })
      .from(movements);

    let categorized = 0;
    let markedAsTransfer = 0;
    let unchanged = 0;

    const catBuckets = new Map<string, string[]>();
    const transferBuckets = new Map<string, string[]>();

    for (const m of candidates) {
      const desc = m.description.toLowerCase();

      let transferMatch: { targetAccountId: string } | null = null;
      for (const r of allTransferRules) {
        if (r.sourceAccountId && r.sourceAccountId !== m.accountId) continue;
        if (desc.includes(r.pattern)) {
          transferMatch = { targetAccountId: r.targetAccountId };
          break;
        }
      }

      if (transferMatch) {
        const key = transferMatch.targetAccountId;
        if (!transferBuckets.has(key)) transferBuckets.set(key, []);
        transferBuckets.get(key)!.push(m.id);
        markedAsTransfer += 1;
        continue;
      }

      let catMatch: { categoryId: string } | null = null;
      for (const r of allCatRules) {
        if (r.movementType && r.movementType !== m.type) continue;
        if (desc.includes(r.pattern)) {
          catMatch = { categoryId: r.categoryId };
          break;
        }
      }

      if (catMatch) {
        const key = catMatch.categoryId;
        if (!catBuckets.has(key)) catBuckets.set(key, []);
        catBuckets.get(key)!.push(m.id);
        categorized += 1;
      } else {
        unchanged += 1;
      }
    }

    for (const [categoryId, ids] of catBuckets) {
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

    return {
      totalScanned: candidates.length,
      categorized,
      markedAsTransfer,
      unchanged,
    };
  });
}

async function diagnose() {
  const unmatched = await db
    .select({
      id: movements.id,
      description: movements.description,
      amount: movements.amount,
      type: movements.type,
    })
    .from(movements)
    .where(and(isNull(movements.categoryId), eq(movements.isTransfer, false)));

  console.log(`\nUNMATCHED RESIDUI: ${unmatched.length}\n`);

  // Raggruppa per parole chiave nelle prime 60 char
  const groups = new Map<string, typeof unmatched>();
  for (const m of unmatched) {
    const key = m.description.slice(0, 50).toLowerCase().replace(/\s+/g, " ").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  console.log("Top 15 cluster di unmatched:");
  for (const [k, rows] of sorted.slice(0, 15)) {
    const tot = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    console.log(`  ${String(rows.length).padStart(3)}x  EUR ${tot.toFixed(0).padStart(6)}  ${k.slice(0, 70)}`);
  }
}

async function main() {
  console.log("=== SEED ===");
  const seedRes = await seed();
  console.log(seedRes);

  console.log("\n=== APPLY (override=true) ===");
  const applyRes = await apply();
  console.log(applyRes);

  console.log("\n=== DIAGNOSE ===");
  await diagnose();

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
