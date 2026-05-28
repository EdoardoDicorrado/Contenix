import "server-only";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

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

export async function listCategoriesWithStats() {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      color: categories.color,
      movementsCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM movements WHERE movements.category_id = ${categories.id}
      ), 0)`,
      total: sql<string>`COALESCE((
        SELECT SUM(amount) FROM movements WHERE movements.category_id = ${categories.id}
      ), 0)`,
      rulesCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM categorization_rules WHERE categorization_rules.category_id = ${categories.id}
      ), 0)`,
      lastMovementAt: sql<Date | null>`(
        SELECT MAX(date) FROM movements WHERE movements.category_id = ${categories.id}
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.type), asc(categories.name));
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
