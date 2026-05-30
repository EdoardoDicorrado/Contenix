"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoiceMovements, invoices, movements } from "@/lib/db/schema";
import { learnAliasFromMatch } from "@/lib/db/queries/counterparty-aliases";
import {
  createMatch,
  getMatchedTotal,
  getMovementAllocation,
  searchInvoicesForMatch,
  searchMovementsForMatch,
  suggestInvoicesForMovement,
  suggestMatches,
  type SearchInvoiceResult,
  type SearchMovementResult,
} from "@/lib/db/queries/matches";
import { getAliasesFor } from "@/lib/db/queries/counterparty-aliases";
import {
  classifyScore,
  scoreMatch,
  type InvoiceForMatch,
  type MovementForMatch,
} from "@/lib/invoice-matching";

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
  /** Finestra temporale (ISO strings) — prevale su year/month. */
  fromIso?: string;
  toIso?: string;
  year?: number;
  month?: number;
  type?: "income" | "expense";
  amountMin?: number;
  amountMax?: number;
  /** Calcola e include `score` per ogni risultato (usa scoreMatch). */
  withScores?: boolean;
  /** Ordinamento dei risultati: "date" (default backend) | "score" (richiede withScores). */
  sortBy?: "date" | "score";
  /** Numero massimo di risultati (default 100). */
  limit?: number;
}): Promise<SearchMovementsResult> {
  try {
    const hasFilters =
      (opts.query && opts.query.trim().length > 0) ||
      opts.fromIso != null ||
      opts.toIso != null ||
      opts.year != null ||
      opts.month != null ||
      opts.type != null ||
      opts.amountMin != null ||
      opts.amountMax != null;

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

    let results = await searchMovementsForMatch({
      invoiceId: opts.invoiceId,
      query: opts.query,
      from: opts.fromIso ? new Date(opts.fromIso) : undefined,
      to: opts.toIso ? new Date(opts.toIso) : undefined,
      year: opts.year,
      month: opts.month,
      type: opts.type,
      amountMin: opts.amountMin,
      amountMax: opts.amountMax,
      limit: opts.limit ?? 100,
    });

    // Score-per-risultato (opt-in: usato dal picker Riabbina)
    if (opts.withScores && results.length > 0) {
      const [inv] = await db
        .select({
          id: invoices.id,
          number: invoices.number,
          type: invoices.type,
          counterpartyName: invoices.counterpartyName,
          counterpartyVat: invoices.counterpartyVat,
          issueDate: invoices.issueDate,
          totalAmount: invoices.totalAmount,
          paymentIban: invoices.paymentIban,
        })
        .from(invoices)
        .where(eq(invoices.id, opts.invoiceId))
        .limit(1);
      if (inv) {
        const aliases = await getAliasesFor(inv.counterpartyName);
        const invForScoring: InvoiceForMatch = {
          id: inv.id,
          number: inv.number,
          type: inv.type,
          counterpartyName: inv.counterpartyName,
          counterpartyVat: inv.counterpartyVat,
          paymentIban: inv.paymentIban,
          issueDate: inv.issueDate,
          totalAmount: inv.totalAmount,
        };
        results = results.map((r) => {
          const mov: MovementForMatch = {
            id: r.id,
            date: r.date,
            amount: r.amount,
            type: r.type,
            description: r.description,
          };
          const s = scoreMatch(invForScoring, mov, aliases);
          return { ...r, score: s.score };
        });
      }
    }

    if (opts.sortBy === "score") {
      results = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

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
  fromIso?: string;
  toIso?: string;
  year?: number;
  month?: number;
  type?: "sale" | "purchase";
  amountMin?: number;
  amountMax?: number;
  /** Calcola score per ogni risultato (usa scoreMatch). */
  withScores?: boolean;
  /** Ordinamento risultati. "score" richiede withScores. */
  sortBy?: "date" | "score";
  limit?: number;
}): Promise<SearchInvoicesResult> {
  try {
    const hasFilters =
      (opts.query && opts.query.trim().length > 0) ||
      opts.fromIso != null ||
      opts.toIso != null ||
      opts.year != null ||
      opts.month != null ||
      opts.type != null ||
      opts.amountMin != null ||
      opts.amountMax != null;

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

    let results = await searchInvoicesForMatch({
      movementId: opts.movementId,
      query: opts.query,
      from: opts.fromIso ? new Date(opts.fromIso) : undefined,
      to: opts.toIso ? new Date(opts.toIso) : undefined,
      year: opts.year,
      month: opts.month,
      type: opts.type,
      amountMin: opts.amountMin,
      amountMax: opts.amountMax,
      limit: opts.limit ?? 100,
    });

    // Score-per-risultato (opt-in: usato dal picker da-rivedere lato movimento)
    if (opts.withScores && results.length > 0) {
      const [mov] = await db
        .select({
          id: movements.id,
          date: movements.date,
          amount: movements.amount,
          type: movements.type,
          description: movements.description,
        })
        .from(movements)
        .where(eq(movements.id, opts.movementId))
        .limit(1);
      if (mov) {
        const movForScoring: MovementForMatch = {
          id: mov.id,
          date: mov.date,
          amount: mov.amount,
          type: mov.type,
          description: mov.description,
        };
        results = await Promise.all(
          results.map(async (r) => {
            const aliases = await getAliasesFor(r.counterpartyName);
            const invForScoring: InvoiceForMatch = {
              id: r.id,
              number: r.number,
              type: r.type,
              counterpartyName: r.counterpartyName,
              counterpartyVat: r.counterpartyVat,
              paymentIban: null,
              issueDate: r.issueDate,
              totalAmount: r.totalAmount,
            };
            const s = scoreMatch(invForScoring, movForScoring, aliases);
            return { ...r, score: s.score };
          }),
        );
      }
    }

    if (opts.sortBy === "score") {
      results = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    return { ok: true, suggestions, results };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore ricerca",
    };
  }
}

/**
 * Marca/sblocca un movimento come "non abbinabile" (commissioni bancarie,
 * IVA versata, stipendi, ecc.). Esclude da auto-match e picker.
 */
export async function setMovementMatchUnavailableAction(opts: {
  movementId: string;
  value: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(movements)
      .set({ matchUnavailable: opts.value, updatedAt: new Date() })
      .where(eq(movements.id, opts.movementId));

    revalidatePath("/movimenti");
    revalidatePath("/fatture");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
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
 * Calcola la quota da abbinare di default per la coppia (fattura, movimento).
 * Restituisce `min(remaining_fattura, residual_movimento)`. Non scende sotto
 * zero. Usata sia per il default UI sia per validazione anti-sforamento.
 */
async function computeSafeAmount(
  invoiceId: string,
  movementId: string,
): Promise<{ amount: number; remaining: number; residual: number } | null> {
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) return null;

  const matched = await getMatchedTotal(invoiceId);
  const remaining = Math.max(0, parseFloat(inv.totalAmount) - matched);

  const alloc = await getMovementAllocation(movementId);
  if (!alloc) return null;

  const amount = Math.min(remaining, alloc.residual);
  return { amount, remaining, residual: alloc.residual };
}

/**
 * Crea il link fattura ↔ movimento. Usata da entrambi gli overlay "Abbina"
 * (anche multi-select). Valida:
 *  - amount > 0
 *  - amount ≤ remaining_fattura (con tolleranza di 0.01 per float)
 *  - amount ≤ residual_movimento (con tolleranza di 0.01)
 *
 * Se `matchedAmount` non è passato → usa il "safe default":
 *   `min(remaining_fattura, residual_movimento)`.
 *
 * Le revalidate sono fatte UNA volta per call. Per multi-select usare il
 * batch action (`linkBatchAction`) che le aggrega.
 */
export async function linkInvoiceMovementAction(opts: {
  invoiceId: string;
  movementId: string;
  matchedAmount?: string;
  /** Se true, evita le revalidate (utili per batch caller). */
  skipRevalidate?: boolean;
}): Promise<LinkInvoiceMovementResult> {
  try {
    const safe = await computeSafeAmount(opts.invoiceId, opts.movementId);
    if (!safe) return { ok: false, error: "Fattura o movimento non trovato" };

    if (safe.remaining < 0.005) {
      return { ok: false, error: "La fattura è già completamente matchata" };
    }
    if (safe.residual < 0.005) {
      return {
        ok: false,
        error: "Il movimento è già completamente allocato ad altre fatture",
      };
    }

    let amount = opts.matchedAmount
      ? parseFloat(opts.matchedAmount.replace(",", "."))
      : safe.amount;

    if (isNaN(amount) || amount <= 0) {
      return { ok: false, error: "Importo non valido" };
    }
    // Tolleranza 0.01 per arrotondamenti
    if (amount > safe.remaining + 0.01) {
      return {
        ok: false,
        error: `L'importo supera il residuo fattura (${safe.remaining.toFixed(2)} €)`,
      };
    }
    if (amount > safe.residual + 0.01) {
      return {
        ok: false,
        error: `L'importo supera il residuo movimento (${safe.residual.toFixed(2)} €)`,
      };
    }
    // Clamp ai residui (in caso di micro-eccedenza per arrotondamenti)
    amount = Math.min(amount, safe.remaining, safe.residual);

    await createMatch({
      invoiceId: opts.invoiceId,
      movementId: opts.movementId,
      matchedAmount: amount.toFixed(2),
      matchType: "manual",
    });
    await syncInvoiceStatus(opts.invoiceId);
    // Vendor learning: salviamo un alias se la description del movimento
    // contiene token significativi diversi dal nome controparte canonico.
    // Best-effort: errori vengono inghiottiti per non bloccare il link.
    try {
      const [pair] = await db
        .select({
          counterpartyName: invoices.counterpartyName,
          description: movements.description,
        })
        .from(invoices)
        .where(eq(invoices.id, opts.invoiceId))
        .leftJoin(movements, eq(movements.id, opts.movementId))
        .limit(1);
      if (pair && pair.description) {
        await learnAliasFromMatch({
          counterpartyName: pair.counterpartyName,
          movementDescription: pair.description,
          source: "auto",
        });
      }
    } catch {
      // ignora
    }

    if (!opts.skipRevalidate) {
      revalidatePath("/fatture");
      revalidatePath("/fatture/da-rivedere");
      revalidatePath(`/fatture/${opts.invoiceId}`);
      revalidatePath("/movimenti");
      revalidatePath("/");
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore creazione match",
    };
  }
}

/**
 * Crea N link fattura↔movimento in un colpo solo. Usato dal multi-select
 * "Abbina queste 3 fatture allo stesso movimento" (pagamento aggregato).
 *
 * Ogni singolo link passa attraverso `linkInvoiceMovementAction` per la
 * validazione: la prima eccedenza interrompe il batch e ritorna gli errori.
 * Le revalidate sono fatte UNA volta in coda al batch.
 */
export type LinkBatchResult =
  | { ok: true; created: number }
  | { ok: false; error: string; created: number; failed: string[] };

export async function linkBatchAction(
  links: Array<{
    invoiceId: string;
    movementId: string;
    matchedAmount?: string;
  }>,
): Promise<LinkBatchResult> {
  if (links.length === 0) return { ok: true, created: 0 };

  let created = 0;
  const failed: string[] = [];

  for (const link of links) {
    const res = await linkInvoiceMovementAction({
      ...link,
      skipRevalidate: true,
    });
    if (res.ok) created += 1;
    else failed.push(res.error);
  }

  // Revalidate una volta sola alla fine
  revalidatePath("/fatture");
  revalidatePath("/fatture/da-rivedere");
  revalidatePath("/movimenti");
  revalidatePath("/");

  if (failed.length > 0) {
    return {
      ok: false,
      error: `${failed.length} di ${links.length} link falliti: ${failed[0]}`,
      created,
      failed,
    };
  }
  return { ok: true, created };
}

/**
 * Espone il safe default + i residui correnti per la coppia, così l'overlay
 * può mostrare l'importo proposto e i numeri di contesto prima del submit.
 */
export type SafeAmountPreview = {
  ok: true;
  defaultAmount: string;
  invoiceRemaining: string;
  movementResidual: string;
} | { ok: false; error: string };

export async function getSafeAmountAction(opts: {
  invoiceId: string;
  movementId: string;
}): Promise<SafeAmountPreview> {
  try {
    const safe = await computeSafeAmount(opts.invoiceId, opts.movementId);
    if (!safe) return { ok: false, error: "Coppia non trovata" };
    return {
      ok: true,
      defaultAmount: safe.amount.toFixed(2),
      invoiceRemaining: safe.remaining.toFixed(2),
      movementResidual: safe.residual.toFixed(2),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}

// =============================================================
// Suggerimenti pagamenti aggregati (1 movimento → N fatture stesso fornitore)
// =============================================================

const AGGREGATE_WINDOW_DAYS = 60;
const AGGREGATE_MAX_OTHER_INVOICES = 6;

export type AggregateSuggestion = {
  movement: {
    id: string;
    date: Date;
    amount: string;
    type: "income" | "expense";
    description: string;
  };
  invoices: Array<{
    id: string;
    number: string;
    counterpartyName: string;
    issueDate: Date;
    totalAmount: string;
  }>;
};

function toCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

function findUniqueSubsetWithAnchor(
  target: number,
  anchor: number,
  others: number[],
): number[] | null {
  // Sottraggo l'ancora (sempre inclusa) e cerco subset degli altri che sommi al resto
  const remainingTarget = target - anchor;
  if (remainingTarget === 0) return [];
  if (remainingTarget < 0) return null;
  const found: number[][] = [];
  const picked: number[] = [];
  function bt(idx: number, remaining: number) {
    if (found.length > 1) return;
    if (remaining === 0 && picked.length > 0) {
      found.push([...picked]);
      return;
    }
    if (idx >= others.length || remaining < 0) return;
    bt(idx + 1, remaining);
    if (found.length > 1) return;
    picked.push(idx);
    bt(idx + 1, remaining - others[idx]);
    picked.pop();
  }
  bt(0, remainingTarget);
  return found.length === 1 ? found[0] : null;
}

export async function findAggregateSuggestionsForInvoiceAction(
  invoiceId: string,
): Promise<AggregateSuggestion[]> {
  try {
    const [anchor] = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        type: invoices.type,
        counterpartyName: invoices.counterpartyName,
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!anchor) return [];

    const start = new Date(anchor.issueDate);
    start.setUTCDate(start.getUTCDate() - AGGREGATE_WINDOW_DAYS);
    const end = new Date(anchor.issueDate);
    end.setUTCDate(end.getUTCDate() + AGGREGATE_WINDOW_DAYS);

    // Altre fatture aperte stesso fornitore in finestra (residuo > 0)
    const matchedTotalSql = sql<string>`COALESCE((
      SELECT SUM(${invoiceMovements.matchedAmount})
      FROM ${invoiceMovements}
      WHERE ${invoiceMovements.invoiceId} = ${invoices.id}
        AND ${invoiceMovements.approvalStatus} = 'approved'
    ), 0)`;
    const others = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        counterpartyName: invoices.counterpartyName,
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
        matchedTotal: matchedTotalSql,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.counterpartyName, anchor.counterpartyName),
          eq(invoices.type, anchor.type),
          ne(invoices.id, anchor.id),
          ne(invoices.status, "cancelled"),
          gte(invoices.issueDate, start),
          lte(invoices.issueDate, end),
          sql`(${matchedTotalSql})::numeric < ${invoices.totalAmount}::numeric`,
        ),
      )
      .limit(AGGREGATE_MAX_OTHER_INVOICES);

    if (others.length === 0) return [];

    // Movimenti candidati: stesso tipo (income/expense corrispondente), in finestra,
    // non transfer, importo > totalAmount fattura anchor (per esserci almeno 1
    // ulteriore fattura nel subset).
    const expectedDir: "income" | "expense" =
      anchor.type === "sale" ? "income" : "expense";
    const anchorCents = toCents(anchor.totalAmount);

    // Massimo aggregabile = anchor + somma di tutti gli others. Movimenti
    // più grandi non possono mai matchare il subset.
    const maxAggregate =
      parseFloat(anchor.totalAmount) +
      others.reduce((s, o) => s + parseFloat(o.totalAmount), 0);

    // Escludo movimenti il cui residuo (amount - SUM matched approved) <= 0,
    // così evitiamo di proporre pagamenti già completamente allocati.
    const movementResidualSql = sql<string>`(
      ${movements.amount}::numeric - COALESCE((
        SELECT SUM(${invoiceMovements.matchedAmount})
        FROM ${invoiceMovements}
        WHERE ${invoiceMovements.movementId} = ${movements.id}
          AND ${invoiceMovements.approvalStatus} = 'approved'
      ), 0)
    )`;

    const candidateMovs = await db
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
          eq(movements.type, expectedDir),
          eq(movements.isTransfer, false),
          eq(movements.matchUnavailable, false),
          gte(movements.date, start),
          lte(movements.date, end),
          sql`(${movements.amount})::numeric > ${parseFloat(anchor.totalAmount) * 1.01}`,
          sql`(${movements.amount})::numeric <= ${maxAggregate * 1.01}`,
          sql`(${movementResidualSql})::numeric > 0.005`,
        ),
      )
      .limit(30);

    const othersCents = others.map((o) => toCents(o.totalAmount));

    const suggestions: AggregateSuggestion[] = [];
    for (const mov of candidateMovs) {
      const movCents = toCents(mov.amount);
      const subsetIdx = findUniqueSubsetWithAnchor(
        movCents,
        anchorCents,
        othersCents,
      );
      if (subsetIdx === null) continue;
      const includedOthers = subsetIdx.map((i) => others[i]);
      if (includedOthers.length === 0) continue;
      suggestions.push({
        movement: {
          id: mov.id,
          date: mov.date,
          amount: mov.amount,
          type: mov.type,
          description: mov.description,
        },
        invoices: [
          {
            id: anchor.id,
            number: anchor.number,
            counterpartyName: anchor.counterpartyName,
            issueDate: anchor.issueDate,
            totalAmount: anchor.totalAmount,
          },
          ...includedOthers.map((o) => ({
            id: o.id,
            number: o.number,
            counterpartyName: o.counterpartyName,
            issueDate: o.issueDate,
            totalAmount: o.totalAmount,
          })),
        ],
      });
      if (suggestions.length >= 5) break;
    }
    return suggestions;
  } catch {
    return [];
  }
}

export type LinkAggregateResult =
  | { ok: true; created: number }
  | { ok: false; error: string; created: number };

/**
 * Crea N match approved per un pagamento aggregato (1 movimento → N fatture).
 * Ogni link usa il totale fattura come matchedAmount.
 */
export async function linkAggregatePaymentAction(opts: {
  movementId: string;
  invoiceIds: string[];
}): Promise<LinkAggregateResult> {
  let created = 0;
  try {
    for (const invoiceId of opts.invoiceIds) {
      const [inv] = await db
        .select({
          totalAmount: invoices.totalAmount,
          counterpartyName: invoices.counterpartyName,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!inv) continue;
      const matched = await getMatchedTotal(invoiceId);
      const remaining = Math.max(0, parseFloat(inv.totalAmount) - matched);
      if (remaining <= 0.005) continue;

      await createMatch({
        invoiceId,
        movementId: opts.movementId,
        matchedAmount: remaining.toFixed(2),
        matchType: "manual",
      });
      // Sync status fattura
      const newMatched = matched + remaining;
      const newStatus =
        Math.abs(newMatched - parseFloat(inv.totalAmount)) < 0.01
          ? "paid"
          : "partial";
      await db
        .update(invoices)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(invoices.id, invoiceId));

      // Vendor learning
      try {
        const [mov] = await db
          .select({ description: movements.description })
          .from(movements)
          .where(eq(movements.id, opts.movementId))
          .limit(1);
        if (mov?.description) {
          await learnAliasFromMatch({
            counterpartyName: inv.counterpartyName,
            movementDescription: mov.description,
            source: "auto",
          });
        }
      } catch {
        // ignore
      }
      created += 1;
    }

    revalidatePath("/fatture");
    revalidatePath("/fatture/da-rivedere");
    revalidatePath("/movimenti");
    revalidatePath("/");

    return { ok: true, created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore",
      created,
    };
  }
}
