"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  Search as SearchIcon,
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Wallet,
  Sparkles,
  Clock,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "@/components/ui/period-filter";
import { periodToWindow, type PeriodValue } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/utils";
import { searchMovementsForMatchAction } from "./abbina-actions";
import type { SearchMovementResult } from "@/lib/db/queries/matches";
import type { AggregateSuggestion } from "./abbina-actions";

type SearchResult = Awaited<ReturnType<typeof searchMovementsForMatchAction>>;

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

export type PickerInvoice = {
  id: string;
  type: "sale" | "purchase";
  number: string;
  counterpartyName: string;
  counterpartyVat: string | null;
  issueDate: Date;
  totalAmount: string;
};

/**
 * Picker generico di movimenti per match con una fattura.
 * Layout 2 colonne (fattura sticky sx | lista con score dx), filtri completi,
 * sort per score/data, paginazione client.
 *
 * Il chiamante decide cosa fare quando si seleziona un movimento via
 * `onSelect(movementId, amount, score)`. Usato sia in "Riabbina" (swap) sia
 * in "Abbina" (createMatch).
 */
export function MovementPickerOverlay({
  invoice,
  title,
  subtitle,
  asideHint,
  busyMovementId,
  onSelect,
  onClose,
  aggregateSuggestions,
  loadingAggregates,
  busyAggregateMovementId,
  onAggregateConfirm,
}: {
  invoice: PickerInvoice;
  title: string;
  subtitle?: string;
  asideHint?: string;
  busyMovementId: string | null;
  onSelect: (movementId: string, amount: string, score: number) => void;
  onClose: () => void;
  aggregateSuggestions?: AggregateSuggestion[];
  loadingAggregates?: boolean;
  busyAggregateMovementId?: string | null;
  onAggregateConfirm?: (suggestion: AggregateSuggestion) => void;
}) {
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
      const res = await searchMovementsForMatchAction({
        invoiceId: invoice.id,
        query: query.trim() || undefined,
        fromIso: from?.toISOString(),
        toIso: to?.toISOString(),
        type: invoice.type === "sale" ? "income" : "expense",
        amountMin: minN ?? undefined,
        amountMax: maxN ?? undefined,
        withScores: true,
        sortBy,
        limit: 100,
      });
      setData(res);
      setVisibleCount(PAGE_SIZE);
    });
  }, [invoice.id, invoice.type, query, period, amountMin, amountMax, sortBy]);

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

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] flex-1 min-h-0">
          <aside className="border-r border-border p-4 overflow-y-auto bg-muted/20">
            <div className="flex items-center gap-1.5">
              {invoice.type === "sale" ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              ) : (
                <ArrowDownLeft className="h-3.5 w-3.5 text-danger" />
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fattura
              </span>
            </div>

            <div className="mt-2">
              <div className="font-mono text-sm font-medium text-foreground">
                {invoice.number}
              </div>
              <div className="text-sm text-foreground mt-0.5 break-words">
                {invoice.counterpartyName}
              </div>
              {invoice.counterpartyVat && (
                <div className="text-[10.5px] text-muted-foreground font-mono mt-0.5">
                  {invoice.counterpartyVat}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Field icon={<Calendar className="h-3 w-3" />} label="Emessa">
                {formatDate(invoice.issueDate)}
              </Field>
              <Field icon={<Wallet className="h-3 w-3" />} label="Totale">
                <span className="tabular-nums font-medium">
                  {formatCurrency(parseFloat(invoice.totalAmount))}
                </span>
              </Field>
            </div>

            {asideHint && (
              <div className="mt-4 pt-4 border-t border-border text-[11px] text-muted-foreground">
                {asideHint}
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
                    placeholder="Cerca nella descrizione…"
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
              {(loadingAggregates ||
                (aggregateSuggestions && aggregateSuggestions.length > 0)) && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <Layers className="h-3.5 w-3.5 text-foreground" />
                    <span className="text-[11px] uppercase tracking-wider font-medium text-foreground">
                      Pagamenti aggregati possibili
                    </span>
                    {loadingAggregates && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {!loadingAggregates && aggregateSuggestions && (
                    <ul className="flex flex-col gap-2">
                      {aggregateSuggestions.map((s) => (
                        <li key={s.movement.id}>
                          <AggregateSuggestionCard
                            suggestion={s}
                            anchorInvoiceId={invoice.id}
                            busy={busyAggregateMovementId === s.movement.id}
                            disabled={
                              busyAggregateMovementId != null &&
                              busyAggregateMovementId !== s.movement.id
                            }
                            onConfirm={() => onAggregateConfirm?.(s)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {!loadingAggregates &&
                    aggregateSuggestions &&
                    aggregateSuggestions.length > 0 && (
                      <div className="border-b border-border mt-4" />
                    )}
                </div>
              )}
              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento…
                </div>
              ) : !data!.ok ? (
                <div className="py-12 text-center text-sm text-danger">{data!.error}</div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nessun risultato. Allarga i filtri o prova un altro termine.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-muted-foreground px-1">
                    {results.length} movimenti compatibili — mostrati {visible.length}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {visible.map((m) => (
                      <li key={m.id}>
                        <MovementCard
                          movement={m}
                          busy={busyMovementId === m.id}
                          disabled={busyMovementId != null && busyMovementId !== m.id}
                          onUse={() =>
                            onSelect(m.id, m.amount, m.score ?? 0)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {hasMore && (
                    <div className="flex items-center justify-center pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        Mostra altri {Math.min(PAGE_SIZE, results.length - visibleCount)}{" "}
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

function MovementCard({
  movement,
  busy,
  disabled,
  onUse,
}: {
  movement: SearchMovementResult;
  busy: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  const isIncome = movement.type === "income";
  const score = movement.score ?? 0;
  const klass = classifyScore(score);

  return (
    <div className="rounded-md border border-border bg-background p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Movimento
          </span>
          {movement.score != null && (
            <Badge tone={SCORE_TONE[klass]}>
              {SCORE_LABEL[klass]} · {score}
            </Badge>
          )}
          {movement.alreadyLinked && <Badge tone="neutral">Già linkato</Badge>}
        </div>

        <div className="text-sm text-foreground break-words whitespace-pre-wrap">
          {movement.description}
        </div>

        <div className="flex flex-col gap-1 text-[11px]">
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
              {formatCurrency(Math.abs(parseFloat(movement.amount)))}
            </span>
          </Field>
        </div>
      </div>

      <Button
        size="sm"
        onClick={onUse}
        disabled={disabled || busy}
        className="gap-1.5 shrink-0"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Usa questo
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

function AggregateSuggestionCard({
  suggestion,
  anchorInvoiceId,
  busy,
  disabled,
  onConfirm,
}: {
  suggestion: AggregateSuggestion;
  anchorInvoiceId: string;
  busy: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const { movement, invoices } = suggestion;
  const isIncome = movement.type === "income";
  const sum = invoices.reduce((acc, i) => acc + parseFloat(i.totalAmount), 0);

  return (
    <div className="rounded-md border border-foreground/30 bg-foreground/[0.03] p-3 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Layers className="h-3.5 w-3.5 text-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-foreground font-medium">
              Aggregato di {invoices.length} fatture
            </span>
          </div>
          <div className="text-sm text-foreground break-words whitespace-pre-wrap">
            {movement.description}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(movement.date)}
            </span>
            <span
              className={
                "tabular-nums font-medium inline-flex items-center gap-1 " +
                (isIncome ? "text-success" : "text-danger")
              }
            >
              <Wallet className="h-3 w-3" />
              {isIncome ? "+" : "−"}
              {formatCurrency(Math.abs(parseFloat(movement.amount)))}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={disabled || busy}
          className="gap-1.5 shrink-0"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Abbina gruppo
        </Button>
      </div>

      <div className="rounded border border-border bg-background/50 divide-y divide-border">
        {invoices.map((inv) => {
          const isAnchor = inv.id === anchorInvoiceId;
          return (
            <div
              key={inv.id}
              className="px-2.5 py-1.5 text-[11px] flex items-center gap-2"
            >
              <span
                className={
                  "font-mono shrink-0 " +
                  (isAnchor ? "text-foreground font-medium" : "text-muted-foreground")
                }
              >
                {inv.number}
              </span>
              <span className="text-muted-foreground truncate flex-1 min-w-0">
                {inv.counterpartyName}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {formatDate(inv.issueDate)}
              </span>
              <span className="text-foreground tabular-nums font-medium shrink-0 w-20 text-right">
                {formatCurrency(parseFloat(inv.totalAmount))}
              </span>
              {isAnchor && (
                <Badge tone="neutral">questa</Badge>
              )}
            </div>
          );
        })}
        <div className="px-2.5 py-1.5 text-[11px] flex items-center justify-end gap-3 bg-muted/30">
          <span className="text-muted-foreground">Somma</span>
          <span className="text-foreground tabular-nums font-medium w-20 text-right">
            {formatCurrency(sum)}
          </span>
        </div>
      </div>
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
