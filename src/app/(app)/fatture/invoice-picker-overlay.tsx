"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  Search as SearchIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Wallet,
  Sparkles,
  Clock,
  FileText,
  Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "@/components/ui/period-filter";
import { periodToWindow, type PeriodValue } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/utils";
import { searchInvoicesForMatchAction } from "./abbina-actions";
import type { SearchInvoiceResult } from "@/lib/db/queries/matches";

type SearchResult = Awaited<ReturnType<typeof searchInvoicesForMatchAction>>;

const PAGE_SIZE = 30;

function parseAmount(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = parseFloat(t);
  if (isNaN(n) || n < 0) return null;
  return n;
}

const SCORE_TONE: Record<string, "success" | "primary" | "neutral"> = {
  certain: "success",
  probable: "primary",
  weak: "neutral",
  low: "neutral",
};
const SCORE_LABEL: Record<string, string> = {
  certain: "Quasi certo",
  probable: "Probabile",
  weak: "Debole",
  low: "Basso",
};
function classifyScore(s: number): "certain" | "probable" | "weak" | "low" {
  if (s >= 90) return "certain";
  if (s >= 70) return "probable";
  if (s >= 50) return "weak";
  return "low";
}

export type PickerMovement = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
};

/**
 * Picker generico di fatture per match con un movimento. Speculare a
 * MovementPickerOverlay: movimento sticky a sinistra, lista fatture con score a
 * destra. Pensato per il flusso /movimenti → "Abbina fattura".
 */
export function InvoicePickerOverlay({
  movement,
  title,
  subtitle,
  asideHint,
  busyInvoiceId,
  onSelect,
  onClose,
  onMarkUnmatchable,
  unmatchableBusy,
}: {
  movement: PickerMovement;
  title: string;
  subtitle?: string;
  asideHint?: string;
  busyInvoiceId: string | null;
  onSelect: (invoiceId: string, amount: string, score: number) => void;
  onClose: () => void;
  onMarkUnmatchable?: () => void;
  unmatchableBusy?: boolean;
}) {
  const expectedType: "sale" | "purchase" =
    movement.type === "income" ? "sale" : "purchase";

  const [data, setData] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<PeriodValue>({ kind: "all" });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "date">("score");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pendingTx, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const minN = parseAmount(amountMin);
    const maxN = parseAmount(amountMax);
    const { from, to } = periodToWindow(period);
    startTransition(async () => {
      const res = await searchInvoicesForMatchAction({
        movementId: movement.id,
        query: query.trim() || undefined,
        fromIso: from?.toISOString(),
        toIso: to?.toISOString(),
        type: expectedType,
        amountMin: minN ?? undefined,
        amountMax: maxN ?? undefined,
        withScores: true,
        sortBy,
        limit: 100,
      });
      setData(res);
      setVisibleCount(PAGE_SIZE);
    });
  }, [
    movement.id,
    expectedType,
    query,
    period,
    amountMin,
    amountMax,
    sortBy,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isLoading = !data || pendingTx;
  const results = data?.ok ? data.results : [];
  const visible = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;
  const hasFilters =
    query !== "" ||
    period.kind !== "all" ||
    amountMin !== "" ||
    amountMax !== "";

  const isIncome = movement.type === "income";
  const movAbs = Math.abs(parseFloat(movement.amount));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-6xl w-full my-8 flex flex-col max-h-[90vh]">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 shrink-0">
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] flex-1 min-h-0">
          <aside className="border-r border-border p-4 overflow-y-auto bg-muted/20 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                {isIncome ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ArrowDownLeft className="h-3.5 w-3.5 text-danger" />
                )}
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Movimento
                </span>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <Field icon={<Calendar className="h-3 w-3" />} label="Data">
                  {formatDate(movement.date)}
                </Field>
                <Field icon={<Wallet className="h-3 w-3" />} label="Importo">
                  <span
                    className={
                      "tabular-nums font-medium " +
                      (isIncome ? "text-success" : "text-danger")
                    }
                  >
                    {isIncome ? "+" : "−"}
                    {formatCurrency(movAbs)}
                  </span>
                </Field>
              </div>

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Descrizione
                </div>
                <div className="text-sm text-foreground break-words whitespace-pre-wrap">
                  {movement.description}
                </div>
              </div>
            </div>

            {asideHint && (
              <div className="pt-3 border-t border-border text-[11px] text-muted-foreground">
                {asideHint}
              </div>
            )}

            {onMarkUnmatchable && (
              <div className="pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={onMarkUnmatchable}
                  disabled={unmatchableBusy}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="Esclude il movimento dai suggerimenti di abbinamento"
                >
                  {unmatchableBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Ban className="h-3 w-3" />
                  )}
                  Segna come non abbinabile
                </button>
                <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
                  Per movimenti senza fattura: commissioni, IVA, stipendi.
                </p>
              </div>
            )}
          </aside>

          <div className="flex flex-col min-h-0">
            <div className="p-4 flex flex-col gap-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca per numero o controparte…"
                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-muted-foreground">Importo</span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    placeholder="da"
                    className="h-8 w-24 rounded-md border border-input bg-background px-2 pr-5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    €
                  </span>
                </div>
                <span className="text-muted-foreground">–</span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    placeholder="a"
                    className="h-8 w-24 rounded-md border border-input bg-background px-2 pr-5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    €
                  </span>
                </div>
                {amountMin !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      const n = parseAmount(amountMin);
                      if (n != null) setAmountMax(n.toFixed(2));
                    }}
                    className="text-foreground hover:underline"
                  >
                    esatto
                  </button>
                )}

                <span className="text-muted-foreground ml-2">Ordina</span>
                <SortPill
                  active={sortBy === "score"}
                  icon={<Sparkles className="h-3 w-3" />}
                  label="Per probabilità"
                  onClick={() => setSortBy("score")}
                />
                <SortPill
                  active={sortBy === "date"}
                  icon={<Clock className="h-3 w-3" />}
                  label="Per data"
                  onClick={() => setSortBy("date")}
                />

                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setPeriod({ kind: "all" });
                      setAmountMin("");
                      setAmountMax("");
                    }}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento…
                </div>
              ) : !data!.ok ? (
                <div className="py-12 text-center text-sm text-danger">
                  {data!.error}
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nessuna fattura compatibile. Allarga i filtri o prova un altro
                  termine.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-muted-foreground px-1">
                    {results.length} fatture compatibili — mostrate{" "}
                    {visible.length}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {visible.map((inv) => (
                      <li key={inv.id}>
                        <InvoiceCard
                          invoice={inv}
                          busy={busyInvoiceId === inv.id}
                          disabled={
                            busyInvoiceId != null && busyInvoiceId !== inv.id
                          }
                          onUse={() =>
                            onSelect(inv.id, inv.remainingAmount, inv.score ?? 0)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {hasMore && (
                    <div className="flex items-center justify-center pt-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setVisibleCount((c) => c + PAGE_SIZE)
                        }
                      >
                        Mostra altre{" "}
                        {Math.min(PAGE_SIZE, results.length - visibleCount)}{" "}
                        <span className="text-muted-foreground ml-1">
                          ({visibleCount} / {results.length})
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
  busy,
  disabled,
  onUse,
}: {
  invoice: SearchInvoiceResult;
  busy: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  const total = parseFloat(invoice.totalAmount);
  const remaining = parseFloat(invoice.remainingAmount);
  const matched = parseFloat(invoice.matchedAmount);
  const partial = matched > 0 && !invoice.fullyMatched;
  const score = invoice.score ?? 0;
  const klass = classifyScore(score);

  return (
    <div className="rounded-md border border-border bg-background p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {invoice.type === "sale" ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-success" />
          ) : (
            <ArrowDownLeft className="h-3.5 w-3.5 text-danger" />
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fattura
          </span>
          {invoice.score != null && (
            <Badge tone={SCORE_TONE[klass]}>
              {SCORE_LABEL[klass]} · {score}
            </Badge>
          )}
          {invoice.fullyMatched && <Badge tone="success">Già completata</Badge>}
          {partial && (
            <Badge tone="neutral">
              Parziale {Math.round((matched / total) * 100)}%
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-medium text-foreground">
            {invoice.number}
          </span>
          <span className="text-sm text-foreground break-words">
            {invoice.counterpartyName}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-[11px]">
          <Field icon={<Calendar className="h-3 w-3" />} label="Emessa">
            {formatDate(invoice.issueDate)}
          </Field>
          <Field icon={<Wallet className="h-3 w-3" />} label="Totale">
            <span className="tabular-nums font-medium">
              {formatCurrency(total)}
            </span>
          </Field>
          {partial && (
            <Field icon={<Wallet className="h-3 w-3" />} label="Residuo">
              <span className="tabular-nums font-medium text-danger">
                {formatCurrency(remaining)}
              </span>
            </Field>
          )}
        </div>
      </div>

      <Button
        size="sm"
        onClick={onUse}
        disabled={disabled || busy || invoice.fullyMatched}
        className="gap-1.5 shrink-0"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Usa questa
      </Button>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-[11px] flex items-start gap-1.5">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground w-14 shrink-0">{label}</span>
      <span className="text-foreground flex-1 min-w-0">{children}</span>
    </div>
  );
}

function SortPill({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 h-7 px-2 rounded-md border text-xs transition-colors " +
        (active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-muted")
      }
    >
      {icon}
      {label}
    </button>
  );
}
