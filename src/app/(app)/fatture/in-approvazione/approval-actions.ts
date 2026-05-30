"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoiceMovements,
  invoices,
  movements,
} from "@/lib/db/schema";
import { getMatchedTotal } from "@/lib/db/queries/matches";
import { learnAliasFromMatch } from "@/lib/db/queries/counterparty-aliases";

export type PendingApproval = {
  matchId: string;
  matchedAmount: string;
  matchType: string;
  createdAt: Date;
  /** Numero di match pending sullo stesso movement_id (incluso questo).
   *  > 1 = parte di un pagamento aggregato. */
  aggregateGroupSize: number;
  invoice: {
    id: string;
    number: string;
    type: "sale" | "purchase";
    counterpartyName: string;
    counterpartyVat: string | null;
    issueDate: Date;
    dueDate: Date | null;
    totalAmount: string;
    paymentIban: string | null;
    description: string | null;
  };
  movement: {
    id: string;
    date: Date;
    amount: string;
    type: "income" | "expense";
    description: string;
  };
};

/**
 * Lista TUTTI i match in stato 'pending' (proposti dal motore auto, in attesa
 * di approvazione utente). Include i dati di fattura e movimento per il
 * dettaglio in pagina.
 */
export async function listPendingApprovalsAction(): Promise<PendingApproval[]> {
  const rows = await db
    .select({
      matchId: invoiceMovements.id,
      matchedAmount: invoiceMovements.matchedAmount,
      matchType: invoiceMovements.matchType,
      createdAt: invoiceMovements.createdAt,
      aggregateGroupSize: sql<number>`(
        SELECT COUNT(*)::int FROM ${invoiceMovements} im2
        WHERE im2.movement_id = ${invoiceMovements.movementId}
          AND im2.approval_status = 'pending'
      )`,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
      invoiceType: invoices.type,
      counterpartyName: invoices.counterpartyName,
      counterpartyVat: invoices.counterpartyVat,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      invoiceTotalAmount: invoices.totalAmount,
      paymentIban: invoices.paymentIban,
      invoiceDescription: invoices.description,
      movementId: movements.id,
      movementDate: movements.date,
      movementAmount: movements.amount,
      movementType: movements.type,
      movementDescription: movements.description,
    })
    .from(invoiceMovements)
    .innerJoin(invoices, eq(invoiceMovements.invoiceId, invoices.id))
    .innerJoin(movements, eq(invoiceMovements.movementId, movements.id))
    .where(eq(invoiceMovements.approvalStatus, "pending"))
    .orderBy(desc(invoiceMovements.createdAt));

  return rows.map((r) => ({
    matchId: r.matchId,
    matchedAmount: r.matchedAmount,
    matchType: r.matchType,
    createdAt: r.createdAt,
    aggregateGroupSize: r.aggregateGroupSize,
    invoice: {
      id: r.invoiceId,
      number: r.invoiceNumber,
      type: r.invoiceType,
      counterpartyName: r.counterpartyName,
      counterpartyVat: r.counterpartyVat,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      totalAmount: r.invoiceTotalAmount,
      paymentIban: r.paymentIban,
      description: r.invoiceDescription,
    },
    movement: {
      id: r.movementId,
      date: r.movementDate,
      amount: r.movementAmount,
      type: r.movementType,
      description: r.movementDescription,
    },
  }));
}

export async function getPendingCountAction(): Promise<number> {
  try {
    const [row] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(invoiceMovements)
      .where(eq(invoiceMovements.approvalStatus, "pending"));
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

async function syncStatusOnInvoice(invoiceId: string) {
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv || inv.status === "cancelled") return;
  const total = parseFloat(inv.totalAmount);
  const matched = await getMatchedTotal(invoiceId);
  let next: "pending" | "partial" | "paid";
  if (Math.abs(matched - total) < 0.01) next = "paid";
  else if (matched > 0.01) next = "partial";
  else next = "pending";
  if (next !== inv.status) {
    await db
      .update(invoices)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  }
}

export type ApprovalActionResult = { ok: true } | { ok: false; error: string };

/**
 * Approva un singolo match: passa approvalStatus → 'approved' e aggiorna
 * lo status fattura. Triggera anche il vendor learning.
 */
export async function approveMatchAction(
  matchId: string,
): Promise<ApprovalActionResult> {
  try {
    const [row] = await db
      .select({
        invoiceId: invoiceMovements.invoiceId,
        movementId: invoiceMovements.movementId,
      })
      .from(invoiceMovements)
      .where(eq(invoiceMovements.id, matchId))
      .limit(1);
    if (!row) return { ok: false, error: "Match non trovato" };

    await db
      .update(invoiceMovements)
      .set({ approvalStatus: "approved" })
      .where(eq(invoiceMovements.id, matchId));

    await syncStatusOnInvoice(row.invoiceId);

    // Vendor learning
    try {
      const [pair] = await db
        .select({
          counterpartyName: invoices.counterpartyName,
          description: movements.description,
        })
        .from(invoices)
        .where(eq(invoices.id, row.invoiceId))
        .leftJoin(movements, eq(movements.id, row.movementId))
        .limit(1);
      if (pair && pair.description) {
        await learnAliasFromMatch({
          counterpartyName: pair.counterpartyName,
          movementDescription: pair.description,
          source: "auto",
        });
      }
    } catch {
      // ignore
    }

    revalidatePath("/fatture");
    revalidatePath("/fatture/in-approvazione");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

/**
 * Approva in batch più match in un colpo solo.
 */
export async function approveBatchAction(
  matchIds: string[],
): Promise<{ approved: number; failed: number }> {
  let approved = 0;
  let failed = 0;
  for (const id of matchIds) {
    const res = await approveMatchAction(id);
    if (res.ok) approved += 1;
    else failed += 1;
  }
  return { approved, failed };
}

/**
 * Rifiuta un match: cancella la riga (così il movimento torna libero e la
 * fattura torna in 'da rivedere').
 */
export async function rejectMatchAction(
  matchId: string,
): Promise<ApprovalActionResult> {
  try {
    const [row] = await db
      .select({ invoiceId: invoiceMovements.invoiceId })
      .from(invoiceMovements)
      .where(eq(invoiceMovements.id, matchId))
      .limit(1);
    if (!row) return { ok: false, error: "Match non trovato" };

    await db.delete(invoiceMovements).where(eq(invoiceMovements.id, matchId));
    await syncStatusOnInvoice(row.invoiceId);

    revalidatePath("/fatture");
    revalidatePath("/fatture/in-approvazione");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

/**
 * Approva tutti i match pending che condividono lo stesso movement_id
 * (pagamento aggregato: 1 movimento → N fatture).
 */
export async function approveGroupAction(movementId: string): Promise<{
  approved: number;
  failed: number;
}> {
  const rows = await db
    .select({ id: invoiceMovements.id })
    .from(invoiceMovements)
    .where(
      and(
        eq(invoiceMovements.movementId, movementId),
        eq(invoiceMovements.approvalStatus, "pending"),
      ),
    );

  let approved = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await approveMatchAction(r.id);
    if (res.ok) approved += 1;
    else failed += 1;
  }
  return { approved, failed };
}

export type AggregateSibling = {
  matchId: string;
  matchedAmount: string;
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  invoiceTotal: string;
  issueDate: Date;
};

/**
 * Lista le fatture "fratelli" di un match pending: cioè gli altri match pending
 * sullo stesso movimento. Usato nell'overlay Esamina per mostrare il gruppo.
 */
export async function listGroupSiblingsAction(
  movementId: string,
  excludeMatchId: string,
): Promise<AggregateSibling[]> {
  const rows = await db
    .select({
      matchId: invoiceMovements.id,
      matchedAmount: invoiceMovements.matchedAmount,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
      counterpartyName: invoices.counterpartyName,
      invoiceTotal: invoices.totalAmount,
      issueDate: invoices.issueDate,
    })
    .from(invoiceMovements)
    .innerJoin(invoices, eq(invoiceMovements.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceMovements.movementId, movementId),
        eq(invoiceMovements.approvalStatus, "pending"),
        sql`${invoiceMovements.id} <> ${excludeMatchId}`,
      ),
    );
  return rows;
}

/**
 * Cambia il movimento di un match pending. La riga esistente viene
 * aggiornata col nuovo movementId; resta 'pending' fino ad approvazione.
 * Se vuoi confermare contestualmente, chiama approveMatchAction subito dopo.
 */
export async function swapMatchMovementAction(opts: {
  matchId: string;
  newMovementId: string;
  matchedAmount?: string;
}): Promise<ApprovalActionResult> {
  try {
    const upd: Partial<typeof invoiceMovements.$inferInsert> = {
      movementId: opts.newMovementId,
    };
    if (opts.matchedAmount) upd.matchedAmount = opts.matchedAmount;
    await db
      .update(invoiceMovements)
      .set(upd)
      .where(
        and(
          eq(invoiceMovements.id, opts.matchId),
          eq(invoiceMovements.approvalStatus, "pending"),
        ),
      );

    revalidatePath("/fatture/in-approvazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

/**
 * Sostituisce un match pending con un pagamento aggregato:
 * - cancella il match pending corrente
 * - crea N match pending verso il nuovo movimento (1 per ogni fattura inclusa)
 * Mantiene lo stato pending: l'utente deve approvare il gruppo dopo.
 */
export async function swapToAggregateAction(opts: {
  matchId: string;
  movementId: string;
  invoiceIds: string[];
}): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    // 1. Recupera invoiceId del match corrente per fallback sync
    const [current] = await db
      .select({ invoiceId: invoiceMovements.invoiceId })
      .from(invoiceMovements)
      .where(eq(invoiceMovements.id, opts.matchId))
      .limit(1);
    if (!current) return { ok: false, error: "Match non trovato" };

    // 2. Cancella il pending corrente
    await db
      .delete(invoiceMovements)
      .where(eq(invoiceMovements.id, opts.matchId));

    // 3. Crea N match pending verso il movimento aggregato, uno per fattura.
    //    Per ciascuna fattura il matchedAmount = residuo della fattura.
    let created = 0;
    for (const invoiceId of opts.invoiceIds) {
      const [inv] = await db
        .select({ totalAmount: invoices.totalAmount })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!inv) continue;
      const matched = await getMatchedTotal(invoiceId);
      const remaining = Math.max(0, parseFloat(inv.totalAmount) - matched);
      if (remaining <= 0.005) continue;
      await db.insert(invoiceMovements).values({
        invoiceId,
        movementId: opts.movementId,
        matchedAmount: remaining.toFixed(2),
        matchType: "manual",
        approvalStatus: "pending",
      });
      created += 1;
    }

    // 4. Sync status fattura originale (al massimo torna pending)
    await syncStatusOnInvoice(current.invoiceId);

    revalidatePath("/fatture/in-approvazione");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath("/fatture");
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
