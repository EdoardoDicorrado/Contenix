"use server";

import { db } from "@/lib/db";
import { categories, movements } from "@/lib/db/schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

export type DrawerMonthMovement = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  descriptionClean: string | null;
  categoryName: string | null;
  categoryColor: string | null;
};

export type DrawerMonthPage = {
  rows: DrawerMonthMovement[];
  total: number;
  hasMore: boolean;
};

const PAGE_SIZE = 10;

/**
 * Lista paginata di movimenti per un mese (YYYY-MM), filtrabile ulteriormente
 * con i filtri attivi della pagina (type, accountId, categoryIds, search).
 *
 * Total calcolato solo alla prima pagina (offset=0).
 */
export async function getDrawerMonthMovementsAction(opts: {
  month: string; // YYYY-MM
  offset: number;
  type?: "income" | "expense";
  accountId?: string;
  categoryIds?: string[];
  search?: string;
}): Promise<DrawerMonthPage> {
  const [year, monthIndex] = opts.month.split("-").map(Number);
  if (!year || !monthIndex) {
    return { rows: [], total: 0, hasMore: false };
  }
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));

  const conds = [gte(movements.date, start), lt(movements.date, end)];
  if (opts.type) conds.push(eq(movements.type, opts.type));
  if (opts.accountId) conds.push(eq(movements.accountId, opts.accountId));
  if (opts.categoryIds && opts.categoryIds.length > 0) {
    conds.push(sql`${movements.categoryId} = ANY(${opts.categoryIds})`);
  }
  if (opts.search) {
    conds.push(
      sql`${movements.description} ILIKE ${"%" + opts.search + "%"}`,
    );
  }

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: movements.id,
        date: movements.date,
        amount: movements.amount,
        type: movements.type,
        description: movements.description,
        descriptionClean: movements.descriptionClean,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(movements)
      .leftJoin(categories, eq(movements.categoryId, categories.id))
      .where(and(...conds))
      .orderBy(desc(movements.date), desc(movements.createdAt))
      .limit(PAGE_SIZE)
      .offset(opts.offset),
    opts.offset === 0
      ? db
          .select({ c: sql<number>`COUNT(*)::int` })
          .from(movements)
          .where(and(...conds))
      : Promise.resolve([{ c: -1 }]),
  ]);

  return {
    rows,
    total: totalRow[0]?.c ?? 0,
    hasMore: rows.length === PAGE_SIZE,
  };
}
