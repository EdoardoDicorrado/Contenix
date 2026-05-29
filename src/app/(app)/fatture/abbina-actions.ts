"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import {
  createMatch,
  getMatchedTotal,
  searchInvoicesForMatch,
  searchMovementsForMatch,
  suggestInvoicesForMovement,
  suggestMatches,
  type SearchInvoiceResult,
  type SearchMovementResult,
} from "@/lib/db/queries/matches";
import { classifyScore } from "@/lib/invoice-matching";

/**
 * Server actions per il flusso "Abbina" bidirezionale fattura ↔ movimento.
 * Usate sia dal lato fattura (cerca movimento da abbinare) sia dal lato
 * movimento (cerca fattura).
 */

type RankedMovementSuggestion = {
  movementId: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  score: number;
  classification: ReturnType<typeof classifyScore>;
  reasons: string[];
};

type RankedInvoiceSuggestion = {
  invoiceId: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  issueDate: Date;
  totalAmount: string;
  score: number;
  classification: ReturnType<typeof classifyScore>;
  reasons: string[];
};

export type SearchMovementsResult =
  | {
      ok: true;
      suggestions: RankedMovementSuggestion[];
      results: SearchMovementResult[];
    }
  | { ok: false; error: string };

export async function searchMovementsForMatchAction(opts: {
  invoiceId: string;
  query?: string;
  year?: number;
  month?: number;
  type?: "income" | "expense";
}): Promise<SearchMovementsResult> {
  try {
    const hasFilters =
      (opts.query && opts.query.trim().length > 0) ||
      opts.year != null ||
      opts.month != null ||
      opts.type != null;

    // Suggerimenti solo al primo apri (nessun filtro). Altrimenti puoi cercare
    // liberamente e i suggerimenti non hanno più senso.
    const suggestionsRaw = hasFilters
      ? null
      : await suggestMatches(opts.invoiceId);

    const suggestions: RankedMovementSuggestion[] = (suggestionsRaw ?? []).map(
      (s) => ({
        movementId: s.movement.id,
        date: s.movement.date,
        amount: s.movement.amount,
        type: s.movement.type,
        description: s.movement.description,
        score: s.score,
        classification: classifyScore(s.score),
        reasons: s.reasons,
      }),
    );

    const results = await searchMovementsForMatch({
      invoiceId: opts.invoiceId,
      query: opts.query,
      year: opts.year,
      month: opts.month,
      type: opts.type,
    });

    return { ok: true, suggestions, results };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore ricerca",
    };
  }
}

export type SearchInvoicesResult =
  | {
      ok: true;
      suggestions: RankedInvoiceSuggestion[];
      results: SearchInvoiceResult[];
    }
  | { ok: false; error: string };

export async function searchInvoicesForMatchAction(opts: {
  movementId: string;
  query?: string;
  year?: number;
  month?: number;
  type?: "sale" | "purchase";
}): Promise<SearchInvoicesResult> {
  try {
    const hasFilters =
      (opts.query && opts.query.trim().length > 0) ||
      opts.year != null ||
      opts.month != null ||
      opts.type != null;

    const suggestionsRaw = hasFilters
      ? null
      : await suggestInvoicesForMovement(opts.movementId);

    const suggestions: RankedInvoiceSuggestion[] = (suggestionsRaw ?? []).map(
      (s) => ({
        invoiceId: s.invoice.id,
        number: s.invoice.number,
        type: s.invoice.type,
        counterpartyName: s.invoice.counterpartyName,
        issueDate: s.invoice.issueDate,
        totalAmount: s.invoice.totalAmount,
        score: s.score.score,
        classification: classifyScore(s.score.score),
        reasons: s.score.reasons,
      }),
    );

    const results = await searchInvoicesForMatch({
      movementId: opts.movementId,
      query: opts.query,
      year: opts.year,
      month: opts.month,
      type: opts.type,
    });

    return { ok: true, suggestions, results };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore ricerca",
    };
  }
}

async function syncInvoiceStatus(invoiceId: string) {
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv || inv.status === "cancelled") return;
  const total = parseFloat(inv.totalAmount);
  const matched = await getMatchedTotal(invoiceId);
  let newStatus: "pending" | "partial" | "paid";
  if (Math.abs(matched - total) < 0.01) newStatus = "paid";
  else if (matched > 0.01) newStatus = "partial";
  else newStatus = "pending";
  if (newStatus !== inv.status) {
    await db
      .update(invoices)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  }
}

export type LinkInvoiceMovementResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Crea il link fattura ↔ movimento. Usata da entrambi gli overlay "Abbina".
 *
 * - matchedAmount default: min(invoice.totalAmount, movement.amount)
 *   per evitare di sforare nei casi parziali / aggregati.
 */
export async function linkInvoiceMovementAction(opts: {
  invoiceId: string;
  movementId: string;
  matchedAmount?: string;
}): Promise<LinkInvoiceMovementResult> {
  try {
    let amount = opts.matchedAmount;
    if (!amount) {
      const [inv] = await db
        .select({ totalAmount: invoices.totalAmount })
        .from(invoices)
        .where(eq(invoices.id, opts.invoiceId))
        .limit(1);
      if (!inv) return { ok: false, error: "Fattura non trovata" };
      const matched = await getMatchedTotal(opts.invoiceId);
      const remaining = parseFloat(inv.totalAmount) - matched;
      amount = remaining.toFixed(2);
    }

    await createMatch({
      invoiceId: opts.invoiceId,
      movementId: opts.movementId,
      matchedAmount: amount,
      matchType: "manual",
    });
    await syncInvoiceStatus(opts.invoiceId);

    revalidatePath("/fatture");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath(`/fatture/${opts.invoiceId}`);
    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore creazione match",
    };
  }
}
