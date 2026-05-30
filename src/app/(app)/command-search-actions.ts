"use server";

import { db } from "@/lib/db";
import { invoices, movements, categories, financialAccounts } from "@/lib/db/schema";
import { ilike, or, desc, eq } from "drizzle-orm";

export type CommandResult = {
  invoices: Array<{
    id: string;
    number: string;
    counterpartyName: string;
    totalAmount: string;
    type: "sale" | "purchase";
  }>;
  movements: Array<{
    id: string;
    date: Date;
    amount: string;
    type: "income" | "expense";
    description: string;
  }>;
  categories: Array<{
    id: string;
    name: string;
    type: "income" | "expense";
    color: string | null;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
  }>;
};

/**
 * Ricerca globale per la command palette (Cmd+K). Cerca su:
 *  - fatture (numero o controparte)
 *  - movimenti (descrizione)
 *  - categorie (nome)
 *  - conti (nome)
 *
 * Limiti volutamente bassi (8 risultati per tipo) per restare snella.
 */
export async function commandSearchAction(query: string): Promise<CommandResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { invoices: [], movements: [], categories: [], accounts: [] };
  }

  const like = `%${q}%`;

  const [invoiceRows, movementRows, categoryRows, accountRows] =
    await Promise.all([
      db
        .select({
          id: invoices.id,
          number: invoices.number,
          counterpartyName: invoices.counterpartyName,
          totalAmount: invoices.totalAmount,
          type: invoices.type,
        })
        .from(invoices)
        .where(
          or(
            ilike(invoices.number, like),
            ilike(invoices.counterpartyName, like),
          ),
        )
        .orderBy(desc(invoices.issueDate))
        .limit(8),
      db
        .select({
          id: movements.id,
          date: movements.date,
          amount: movements.amount,
          type: movements.type,
          description: movements.description,
        })
        .from(movements)
        .where(ilike(movements.description, like))
        .orderBy(desc(movements.date))
        .limit(8),
      db
        .select({
          id: categories.id,
          name: categories.name,
          type: categories.type,
          color: categories.color,
        })
        .from(categories)
        .where(ilike(categories.name, like))
        .limit(8),
      db
        .select({
          id: financialAccounts.id,
          name: financialAccounts.name,
          type: financialAccounts.type,
        })
        .from(financialAccounts)
        .where(
          or(
            ilike(financialAccounts.name, like),
            eq(financialAccounts.isPrimary, true),
          ),
        )
        .limit(5),
    ]);

  return {
    invoices: invoiceRows,
    movements: movementRows,
    categories: categoryRows,
    accounts: accountRows,
  };
}
