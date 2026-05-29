"use server";

import { getMovementInvoiceMatches } from "@/lib/db/queries/movements";

export type MovementInvoiceMatch = {
  matchId: string;
  id: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  issueDate: Date;
  totalAmount: string;
  matchedAmount: string;
  matchType: string;
};

export type GetMovementMatchesResult =
  | { ok: true; matches: MovementInvoiceMatch[] }
  | { ok: false; error: string };

export async function getMovementMatchesAction(
  movementId: string,
): Promise<GetMovementMatchesResult> {
  try {
    const rows = await getMovementInvoiceMatches(movementId);
    return {
      ok: true,
      matches: rows.map((r) => ({
        matchId: r.matchId,
        id: r.id,
        number: r.number,
        type: r.type,
        counterpartyName: r.counterpartyName,
        issueDate: r.issueDate,
        totalAmount: r.totalAmount,
        matchedAmount: r.matchedAmount,
        matchType: r.matchType,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
