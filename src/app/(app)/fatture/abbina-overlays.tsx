"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Search as SearchIcon,
  Loader2,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  linkInvoiceMovementAction,
  searchInvoicesForMatchAction,
  searchMovementsForMatchAction,
  type SearchInvoicesResult,
  type SearchMovementsResult,
} from "./abbina-actions";

const MONTHS = [
  "Tutti",
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

function yearsRange(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = now; y >= 2020; y--) years.push(y);
  return years;
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

// =============================================================================
// AbbinaMovimentoOverlay — Da una FATTURA cerco MOVIMENTI da abbinare
// =============================================================================

export function AbbinaMovimentoOverlay({
  invoiceId,
  invoiceNumber,
  invoiceType,
  counterparty,
  totalAmount,
  remainingAmount,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: "sale" | "purchase";
  counterparty: string;
  totalAmount: string;
  remainingAmount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<SearchMovementsResult | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reload on filters change
  useEffect(() => {
    let mounted = true;
    startTransition(async () => {
      const res = await searchMovementsForMatchAction({
        invoiceId,
        query: query.trim() || undefined,
        year: year === "" ? undefined : year,
        month: month === "" ? undefined : month,
        type: invoiceType === "sale" ? "income" : "expense",
      });
      if (mounted) setData(res);
    });
    return () => {
      mounted = false;
    };
  }, [invoiceId, invoiceType, query, year, month]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleLink(movementId: string) {
    setLinkError(null);
    setLinkingId(movementId);
    startTransition(async () => {
      const res = await linkInvoiceMovementAction({ invoiceId, movementId });
      setLinkingId(null);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setLinkError(res.error);
      }
    });
  }

  return (
    <Shell
      title="Abbina movimento"
      subtitle={
        <>
          Fattura{" "}
          <span className="font-mono text-foreground">{invoiceNumber}</span> ·{" "}
          {counterparty} ·{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(parseFloat(totalAmount))}
          </span>
          {remainingAmount < parseFloat(totalAmount) - 0.005 && (
            <>
              {" "}
              · Restante{" "}
              <span className="text-danger font-medium">
                {formatCurrency(remainingAmount)}
              </span>
            </>
          )}
        </>
      }
      onClose={onClose}
    >
      <FilterBar
        query={query}
        setQuery={setQuery}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
        placeholder="Cerca nella descrizione del movimento…"
      />

      {linkError && (
        <ErrorBar message={linkError} onClose={() => setLinkError(null)} />
      )}

      {!data ? (
        <LoadingBlock />
      ) : !data.ok ? (
        <ErrorBlock message={data.error} />
      ) : (
        <>
          {data.suggestions.length > 0 && (
            <Section
              title="Suggerimenti automatici"
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              <ul className="divide-y divide-border">
                {data.suggestions.map((s) => (
                  <MovementRow
                    key={s.movementId}
                    movementId={s.movementId}
                    date={s.date}
                    description={s.description}
                    amount={s.amount}
                    type={s.type}
                    score={s.score}
                    classification={s.classification}
                    reasons={s.reasons}
                    alreadyLinked={false}
                    onLink={handleLink}
                    pending={pending && linkingId === s.movementId}
                  />
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Tutti i movimenti${data.results.length ? ` (${data.results.length})` : ""}`}
          >
            {data.results.length === 0 ? (
              <EmptyResults />
            ) : (
              <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                {data.results.map((m) => (
                  <MovementRow
                    key={m.id}
                    movementId={m.id}
                    date={m.date}
                    description={m.description}
                    amount={m.amount}
                    type={m.type}
                    alreadyLinked={m.alreadyLinked}
                    onLink={handleLink}
                    pending={pending && linkingId === m.id}
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Shell>
  );
}

// =============================================================================
// AbbinaFatturaOverlay — Da un MOVIMENTO cerco FATTURE da abbinare
// =============================================================================

export function AbbinaFatturaOverlay({
  movementId,
  movementDescription,
  movementAmount,
  movementType,
  movementDate,
  onClose,
}: {
  movementId: string;
  movementDescription: string;
  movementAmount: string;
  movementType: "income" | "expense";
  movementDate: Date;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<SearchInvoicesResult | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const expectedInvoiceType: "sale" | "purchase" =
    movementType === "income" ? "sale" : "purchase";

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    startTransition(async () => {
      const res = await searchInvoicesForMatchAction({
        movementId,
        query: query.trim() || undefined,
        year: year === "" ? undefined : year,
        month: month === "" ? undefined : month,
        type: expectedInvoiceType,
      });
      if (mounted) setData(res);
    });
    return () => {
      mounted = false;
    };
  }, [movementId, expectedInvoiceType, query, year, month]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleLink(invoiceId: string) {
    setLinkError(null);
    setLinkingId(invoiceId);
    startTransition(async () => {
      const res = await linkInvoiceMovementAction({
        invoiceId,
        movementId,
        matchedAmount: parseFloat(movementAmount).toFixed(2),
      });
      setLinkingId(null);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setLinkError(res.error);
      }
    });
  }

  return (
    <Shell
      title="Abbina fattura"
      subtitle={
        <>
          Movimento del{" "}
          <span className="font-medium text-foreground">
            {formatDate(movementDate)}
          </span>{" "}
          ·{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(parseFloat(movementAmount))}
          </span>{" "}
          · <span className="break-words">{movementDescription}</span>
        </>
      }
      onClose={onClose}
    >
      <FilterBar
        query={query}
        setQuery={setQuery}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
        placeholder="Cerca per numero fattura o controparte…"
      />

      {linkError && (
        <ErrorBar message={linkError} onClose={() => setLinkError(null)} />
      )}

      {!data ? (
        <LoadingBlock />
      ) : !data.ok ? (
        <ErrorBlock message={data.error} />
      ) : (
        <>
          {data.suggestions.length > 0 && (
            <Section
              title="Suggerimenti automatici"
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              <ul className="divide-y divide-border">
                {data.suggestions.map((s) => (
                  <InvoiceRow
                    key={s.invoiceId}
                    invoiceId={s.invoiceId}
                    number={s.number}
                    type={s.type}
                    counterpartyName={s.counterpartyName}
                    issueDate={s.issueDate}
                    totalAmount={s.totalAmount}
                    matchedAmount={"0"}
                    fullyMatched={false}
                    score={s.score}
                    classification={s.classification}
                    reasons={s.reasons}
                    onLink={handleLink}
                    pending={pending && linkingId === s.invoiceId}
                  />
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Tutte le fatture${data.results.length ? ` (${data.results.length})` : ""}`}
          >
            {data.results.length === 0 ? (
              <EmptyResults />
            ) : (
              <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                {data.results.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoiceId={inv.id}
                    number={inv.number}
                    type={inv.type}
                    counterpartyName={inv.counterpartyName}
                    issueDate={inv.issueDate}
                    totalAmount={inv.totalAmount}
                    matchedAmount={inv.matchedAmount}
                    fullyMatched={inv.fullyMatched}
                    onLink={handleLink}
                    pending={pending && linkingId === inv.id}
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Shell>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-3xl w-full my-8">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 sticky top-0 bg-background z-10 rounded-t-lg">
          <div className="min-w-0">
            <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              {title}
            </h3>
            {subtitle && (
              <div className="text-xs text-muted-foreground mt-0.5 break-words">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded hover:bg-muted shrink-0"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  year,
  setYear,
  month,
  setMonth,
  placeholder,
}: {
  query: string;
  setQuery: (v: string) => void;
  year: number | "";
  setYear: (v: number | "") => void;
  month: number | "";
  setMonth: (v: number | "") => void;
  placeholder: string;
}) {
  const years = yearsRange();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-48">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <select
        value={year}
        onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Tutti anni</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        disabled={year === ""}
        title={year === "" ? "Scegli prima l'anno" : ""}
      >
        <option value="">Tutti mesi</option>
        {MONTHS.slice(1).map((m, i) => (
          <option key={i + 1} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      {(query || year !== "" || month !== "") && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setYear("");
            setMonth("");
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 w-full">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function MovementRow({
  movementId,
  date,
  description,
  amount,
  type,
  score,
  classification,
  reasons,
  alreadyLinked,
  onLink,
  pending,
}: {
  movementId: string;
  date: Date;
  description: string;
  amount: string;
  type: "income" | "expense";
  score?: number;
  classification?: string;
  reasons?: string[];
  alreadyLinked: boolean;
  onLink: (movementId: string) => void;
  pending: boolean;
}) {
  const amt = parseFloat(amount);
  const isIncome = type === "income";
  return (
    <li className="px-3 py-2.5 flex items-start gap-3">
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground tabular-nums">
            {formatDate(date)}
          </span>
          <span
            className={`tabular-nums font-medium ${isIncome ? "text-success" : "text-danger"}`}
          >
            {isIncome ? "+" : "−"}
            {formatCurrency(amt)}
          </span>
          {classification && (
            <Badge tone={SCORE_TONE[classification] ?? "neutral"}>
              {SCORE_LABEL[classification] ?? classification} · {score}
            </Badge>
          )}
          {alreadyLinked && (
            <Badge tone="neutral" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Già linkato altrove
            </Badge>
          )}
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {description}
        </div>
        {reasons && reasons.length > 0 && (
          <div className="text-[10.5px] text-muted-foreground">
            {reasons.slice(0, 3).join(" · ")}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <Button
          type="button"
          size="sm"
          onClick={() => onLink(movementId)}
          disabled={pending}
          className="gap-1"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Abbina
        </Button>
      </div>
    </li>
  );
}

function InvoiceRow({
  invoiceId,
  number,
  type,
  counterpartyName,
  issueDate,
  totalAmount,
  matchedAmount,
  fullyMatched,
  score,
  classification,
  reasons,
  onLink,
  pending,
}: {
  invoiceId: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  issueDate: Date;
  totalAmount: string;
  matchedAmount: string;
  fullyMatched: boolean;
  score?: number;
  classification?: string;
  reasons?: string[];
  onLink: (invoiceId: string) => void;
  pending: boolean;
}) {
  const total = parseFloat(totalAmount);
  const matched = parseFloat(matchedAmount);
  const partial = matched > 0 && matched < total - 0.005;
  return (
    <li className="px-3 py-2.5 flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5 shrink-0">
        {type === "sale" ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-success" />
        ) : (
          <ArrowDownLeft className="h-3.5 w-3.5 text-danger" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono font-medium text-foreground">{number}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatDate(issueDate)}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(total)}
          </span>
          {classification && (
            <Badge tone={SCORE_TONE[classification] ?? "neutral"}>
              {SCORE_LABEL[classification] ?? classification} · {score}
            </Badge>
          )}
          {partial && (
            <Badge tone="neutral">
              Parziale {Math.round((matched / total) * 100)}%
            </Badge>
          )}
          {fullyMatched && (
            <Badge tone="success">Completamente matchata</Badge>
          )}
        </div>
        <div className="text-sm text-foreground break-words">{counterpartyName}</div>
        {reasons && reasons.length > 0 && (
          <div className="text-[10.5px] text-muted-foreground">
            {reasons.slice(0, 3).join(" · ")}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <Button
          type="button"
          size="sm"
          onClick={() => onLink(invoiceId)}
          disabled={pending || fullyMatched}
          className="gap-1"
          title={fullyMatched ? "Fattura già completamente matchata" : undefined}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Abbina
        </Button>
      </div>
    </li>
  );
}

function LoadingBlock() {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
      <Loader2 className="h-4 w-4 animate-spin" />
      Caricamento…
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      Nessun risultato. Prova a togliere qualche filtro.
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-sm text-danger inline-flex items-center justify-center gap-2 w-full">
      <AlertTriangle className="h-4 w-4" />
      {message}
    </div>
  );
}

function ErrorBar({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-danger/60 hover:text-danger"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
