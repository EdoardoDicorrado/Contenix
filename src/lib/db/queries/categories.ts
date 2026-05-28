import "server-only";
import { db } from "@/lib/db";
import { categories, categorizationRules, movements } from "@/lib/db/schema";
import { and, asc, eq, isNotNull, sql, type SQL } from "drizzle-orm";

export type CategoryInput = {
  name: string;
  type: "income" | "expense";
  color: string;
};

export async function listCategories(type?: "income" | "expense") {
  return db
    .select()
    .from(categories)
    .where(type ? eq(categories.type, type) : undefined)
    .orderBy(asc(categories.type), asc(categories.name));
}

export type CategoryStatsWindow = { from?: Date; to?: Date };

export async function listCategoriesWithStats(window: CategoryStatsWindow = {}) {
  // Strategia: 3 query separate (categorie / aggregati movimenti / aggregati regole)
  // e merge in memoria. Più affidabile delle subquery correlate di Drizzle e
  // permette comunque a Neon di parallelizzare via Promise.all.
  const moveConds: SQL[] = [isNotNull(movements.categoryId)];
  if (window.from) moveConds.push(sql`${movements.date} >= ${window.from}`);
  if (window.to) moveConds.push(sql`${movements.date} < ${window.to}`);

  const [cats, moveStats, ruleStats] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
        color: categories.color,
      })
      .from(categories)
      .orderBy(asc(categories.type), asc(categories.name)),
    db
      .select({
        categoryId: movements.categoryId,
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${movements.amount}), 0)::text`,
        lastMovementAt: sql<Date | null>`MAX(${movements.date})`,
      })
      .from(movements)
      .where(and(...moveConds))
      .groupBy(movements.categoryId),
    db
      .select({
        categoryId: categorizationRules.categoryId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(categorizationRules)
      .groupBy(categorizationRules.categoryId),
  ]);

  const moveMap = new Map(moveStats.map((s) => [s.categoryId, s]));
  const ruleMap = new Map(ruleStats.map((s) => [s.categoryId, s.count]));

  return cats.map((c) => {
    const m = moveMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      movementsCount: m?.count ?? 0,
      total: m?.total ?? "0",
      rulesCount: ruleMap.get(c.id) ?? 0,
      lastMovementAt: m?.lastMovementAt ?? null,
    };
  });
}

export async function getCategory(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return row ?? null;
}

export async function createCategory(input: CategoryInput) {
  const [row] = await db.insert(categories).values(input).returning();
  return row;
}

export async function updateCategory(id: string, input: CategoryInput) {
  const [row] = await db
    .update(categories)
    .set(input)
    .where(eq(categories.id, id))
    .returning();
  return row;
}

export async function deleteCategory(id: string) {
  await db.delete(categories).where(eq(categories.id, id));
}
