"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Link2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import { appendSyncRun } from "@/lib/sync-history";
import {
  applyInvoiceMatchesAction,
  type ApplyInvoiceMatchesActionResult,
} from "./invoice-actions";
import { SyncStatRow } from "./sync-stat-row";

export type InvoiceMatchStats = {
  /** Fatture totali (escluse cancellate). */
  total: number;
  /** Fatture con almeno un match registrato. */
  matched: number;
  /** Fatture pienamente matchate (matched_total >= totale). */
  fullyMatched: number;
  /** Fatture senza alcun match. */
  unmatched: number;
};

const STORAGE_KEY = "sync-last-invoice-result";

type PersistedResult = {
  ranAt: string;
  result: Extract<ApplyInvoiceMatchesActionResult, { ok: true }>["result"];
};

export function InvoiceSyncCard({ stats }: { stats: InvoiceMatchStats }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<ApplyInvoiceMatchesActionResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PersistedResult;
        setLastResult({ ok: true, result: parsed.result });
        setRanAt(new Date(parsed.ranAt));
      }
    } catch {
      // ignore
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleApply() {
    startTransition(async () => {
      const res = await applyInvoiceMatchesAction();
      setLastResult(res);
      if (res.ok) {
        const now = new Date();
        setRanAt(now);
        try {
          const payload: PersistedResult = {
            ranAt: now.toISOString(),
            result: res.result,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // ignore
        }
        appendSyncRun("invoices", res.result);
        router.refresh();
      }
    });
  }

  function clearLastResult() {
    setLastResult(null);
    setRanAt(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col">
        <SyncStatRow label="Totale fatture" value={stats.total.toLocaleString("it-IT")} />
        <SyncStatRow
          label="Completamente matchate"
          value={`${stats.fullyMatched.toLocaleString("it-IT")} / ${stats.total.toLocaleString("it-IT")}`}
          hint={
            stats.total > 0
              ? `${((stats.fullyMatched / stats.total) * 100).toFixed(0)}%`
              : undefined
          }
        />
        <SyncStatRow
          label="Con almeno un match"
          value={stats.matched.toLocaleString("it-IT")}
          hint={
            stats.total > 0
              ? `${((stats.matched / stats.total) * 100).toFixed(0)}%`
              : undefined
          }
        />
        <SyncStatRow
          label="Senza match"
          value={stats.unmatched.toLocaleString("it-IT")}
          loss={stats.unmatched > 0}
          hint={
            stats.unmatched > 0 && stats.total > 0
              ? `${((stats.unmatched / stats.total) * 100).toFixed(0)}% da rivedere`
              : "Tutte matchate"
          }
        />
      </div>

      <div className="flex flex-col gap-3 pt-1">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Match automatico per score ≥ 90 (&quot;quasi certo&quot;) + score 70-89
          (&quot;probabile&quot;) con distacco di sicurezza dal secondo. Vanno
          in <strong>/fatture/in-approvazione</strong> e devi approvarli.
        </p>
        <Button onClick={handleApply} disabled={pending} className="w-full gap-2">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {pending ? "Match in corso…" : "Avvia auto-match"}
        </Button>
      </div>

      {lastResult?.ok && (
        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <div className="flex items-start gap-2 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="text-muted-foreground">
                Ultimo run{ranAt ? ` ${formatRelative(ranAt)}` : ""}:
              </span>{" "}
              {lastResult.result.totalScanned} esaminate ·{" "}
              <span className="font-medium">{lastResult.result.autoMatched}</span> match 1:1 ·{" "}
              <span className="font-medium">{lastResult.result.aggregateMatched ?? 0}</span> aggregati ·{" "}
              <span className="font-medium">{lastResult.result.needsReview}</span> da rivedere ·{" "}
              <span className="font-medium">{lastResult.result.noCandidate}</span> senza candidati.
            </div>
            <button
              type="button"
              onClick={clearLastResult}
              className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
              title="Nascondi il report"
            >
              Pulisci
            </button>
          </div>
          {lastResult.result.examples.length > 0 && (
            <MatchesReport examples={lastResult.result.examples} />
          )}
        </div>
      )}

      {lastResult && !lastResult.ok && (
        <div className="flex items-start gap-2 border-t border-border pt-4 text-sm text-danger">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {lastResult.error}
        </div>
      )}
    </div>
  );
}

type Example = Extract<
  ApplyInvoiceMatchesActionResult,
  { ok: true }
>["result"]["examples"][number];

function MatchesReport({ examples }: { examples: Example[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/50 rounded-md"
      >
        <span className="flex items-center gap-1.5 text-foreground font-medium">
          <ArrowRight className="h-3 w-3" />
          Vedi esempi ({examples.length})
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul className="border-t border-border divide-y divide-border max-h-72 overflow-y-auto">
          {examples.map((ex) => (
            <li key={`${ex.invoiceId}-${ex.movementId}`} className="px-3 py-2 text-[11px] flex items-center gap-2 flex-wrap">
              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
              <Link
                href={`/fatture/${ex.invoiceId}`}
                className="font-medium text-foreground hover:underline shrink-0"
              >
                {ex.invoiceNumber}
              </Link>
              <span className="text-muted-foreground truncate">
                {ex.counterparty}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {formatCurrency(parseFloat(ex.totalAmount))}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums shrink-0">
                {formatDate(new Date(ex.movementDate))}
              </span>
              <span className="truncate text-foreground flex-1 min-w-0">
                {ex.movementDescription}
              </span>
              <span className="ml-auto text-[10px] text-success font-medium shrink-0">
                {ex.score}/100
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

