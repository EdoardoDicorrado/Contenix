import "server-only";
import { db } from "@/lib/db";
import { invoiceMovements, movements, invoices } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  rankMatches,
  type InvoiceForMatch,
  type MovementForMatch,
} from "@/lib/invoice-matching";

export type LinkedMatch = {
  id: string;
  invoiceId: string;
  movementId: string;
  matchedAmount: string;
  matchType: string;
  createdAt: Date;
  movement: {
    id: string;
    date: Date;
    amount: string;
    type: "income" | "expense";
    description: string;
  };
};

export async function getInvoiceMatches(invoiceId: string): Promise<LinkedMatch[]> {
  const rows = await db
    .select({
      id: invoiceMovements.id,
      invoiceId: invoiceMovements.invoiceId,
      movementId: invoiceMovements.movementId,
      matchedAmount: invoiceMovements.matchedAmount,
      matchType: invoiceMovements.matchType,
      createdAt: invoiceMovements.createdAt,
      mId: movements.id,
      mDate: movements.date,
      mAmount: movements.amount,
      mType: movements.type,
      mDescription: movements.description,
    })
    .from(invoiceMovements)
    .innerJoin(movements, eq(invoiceMovements.movementId, movements.id))
    .where(eq(invoiceMovements.invoiceId, invoiceId))
    .orderBy(desc(movements.date));

  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoiceId,
    movementId: r.movementId,
    matchedAmount: r.matchedAmount,
    matchType: r.matchType,
    createdAt: r.createdAt,
    movement: {
      id: r.mId,
      date: r.mDate,
      amount: r.mAmount,
      type: r.mType,
      description: r.mDescription,
    },
  }));
}

export async function suggestMatches(invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return null;

  const linked = await db
    .select({ movementId: invoiceMovements.movementId })
    .from(invoiceMovements)
    .where(eq(invoiceMovements.invoiceId, invoiceId));
  const linkedIds = new Set(linked.map((l) => l.movementId));

  const windowDays = 90;
  const startDate = new Date(inv.issueDate);
  startDate.setUTCDate(startDate.getUTCDate() - windowDays);
  const endDate = new Date(inv.issueDate);
  endDate.setUTCDate(endDate.getUTCDate() + windowDays);

  const expectedDirection: "income" | "expense" =
    inv.type === "sale" ? "income" : "expense";

  const candidates = await db
    .select({
      id: movements.id,
      date: movements.date,
      amount: movements.amount,
      type: movements.type,
      description: movements.description,
    })
    .from(movements)
    .where(
      and(
        eq(movements.type, expectedDirection),
        gte(movements.date, startDate),
        lte(movements.date, endDate),
      ),
    );

  const available: MovementForMatch[] = candidates.filter((c) => !linkedIds.has(c.id));

  const invoiceForMatch: InvoiceForMatch = {
    id: inv.id,
    number: inv.number,
    type: inv.type,
    counterpartyName: inv.counterpartyName,
    issueDate: inv.issueDate,
    totalAmount: inv.totalAmount,
  };

  return rankMatches(invoiceForMatch, available, { minScore: 30, limit: 5 });
}

export async function createMatch(opts: {
  invoiceId: string;
  movementId: string;
  matchedAmount: string;
  matchType?: "manual" | "auto" | "ai";
}) {
  const [row] = await db
    .insert(invoiceMovements)
    .values({
      invoiceId: opts.invoiceId,
      movementId: opts.movementId,
      matchedAmount: opts.matchedAmount,
      matchType: opts.matchType ?? "manual",
    })
    .returning();
  return row;
}

export async function deleteMatch(id: string) {
  await db.delete(invoiceMovements).where(eq(invoiceMovements.id, id));
}

export async function getMatchedTotal(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${invoiceMovements.matchedAmount}), 0)`,
    })
    .from(invoiceMovements)
    .where(eq(invoiceMovements.invoiceId, invoiceId));
  return parseFloat(row?.total ?? "0");
}
