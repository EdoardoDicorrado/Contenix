"use server";

import {
  countMovementsByAccount,
  listRecentMovementsByAccount,
} from "@/lib/db/queries/movements";

export type DrawerMovement = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  descriptionClean: string | null;
  categoryName: string | null;
  categoryColor: string | null;
};

export type DrawerMovementsPage = {
  rows: DrawerMovement[];
  total: number;
  hasMore: boolean;
};

const PAGE_SIZE = 10;

/**
 * Ritorna una pagina di movimenti recenti per il conto + conteggio totale
 * (totale calcolato solo alla prima chiamata, offset = 0).
 */
export async function getDrawerMovementsAction(
  accountId: string,
  offset: number,
): Promise<DrawerMovementsPage> {
  const [rows, total] = await Promise.all([
    listRecentMovementsByAccount(accountId, { limit: PAGE_SIZE, offset }),
    offset === 0
      ? countMovementsByAccount(accountId)
      : Promise.resolve(-1),
  ]);

  return {
    rows,
    total,
    hasMore: rows.length === PAGE_SIZE,
  };
}
