"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckToggle } from "@/components/ui/check-toggle";
import { PushDrawer } from "@/components/ui/push-drawer";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import { appendSyncRun } from "@/lib/sync-history";
import { applyRulesAction, type ApplyRulesActionResult } from "../regole/actions";
import { SyncStatRow } from "./sync-stat-row";

const WHITE_BTN_CLASS = cn(
  "inline-flex items-center justify-center gap-2 h-10 w-full rounded-md text-sm font-medium",
  "bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);

export type MovementsStats = {
  total: number;
  categorized: number;
  transfers: number;
  unmatched: number;
};

const STORAGE_KEY = "sync-last-result";

type PersistedResult = {
  ranAt: string; // ISO
  result: Extract<ApplyRulesActionResult, { ok: true }>["result"];
};

export function SyncStatusCard({ stats }: { stats: MovementsStats }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyRulesActionResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  // Carica l'ultimo run dal localStorage al mount. Iniziamo a null (SSR-safe)
  // e idratiamo dopo il mount per evitare hydration mismatch.
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
      // ignora errori di parsing
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleApply() {
    startTransition(async () => {
      const res = await applyRulesAction({ overrideExisting });
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
          // localStorage quota / disabled
        }
        // Storico: append del run per la pagina /sincronizza
        appendSyncRun("categories", res.result);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col">
        <SyncStatRow label="Totale movimenti" value={stats.total.toLocaleString("it-IT")} />
        <SyncStatRow
          label="Categorizzati"
          value={`${stats.categorized.toLocaleString("it-IT")} / ${stats.total.toLocaleString("it-IT")}`}
          hint={
            stats.total > 0
              ? `${((stats.categorized / stats.total) * 100).toFixed(0)}%`
              : undefined
          }
        />
        <SyncStatRow
          label="Trasferimenti tra conti"
          value={stats.transfers.toLocaleString("it-IT")}
          hint={
            stats.total > 0
              ? `${((stats.transfers / stats.total) * 100).toFixed(0)}%`
              : undefined
          }
        />
        <SyncStatRow
          label="Senza categoria"
          value={stats.unmatched.toLocaleString("it-IT")}
          loss={stats.unmatched > 0}
          hint={
            stats.unmatched > 0 && stats.total > 0
              ? `${((stats.unmatched / stats.total) * 100).toFixed(0)}% da rivedere`
              : "Tutto categorizzato"
          }
        />
      </div>

      <div className="flex flex-col gap-4 pt-1">
        <CheckToggle
          checked={overrideExisting}
          onChange={setOverrideExisting}
          disabled={pending}
          label="Sovrascrivi categorizzazioni esistenti"
          description="Riapplica anche ai movimenti già categorizzati"
        />

        <button
          type="button"
          onClick={handleApply}
          disabled={pending}
          className={WHITE_BTN_CLASS}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {pending ? "Riapplicazione…" : "Riapplica regole"}
        </button>
      </div>

      {lastResult?.ok && (
        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <div className="text-xs text-foreground leading-relaxed">
            <span className="text-muted-foreground">
              Ultimo run{ranAt ? ` ${formatRelative(ranAt)}` : ""}:
            </span>{" "}
            {lastResult.result.totalScanned} scansionati,{" "}
            <span className="font-medium">{lastResult.result.categorized}</span> categorizzati,{" "}
            <span className="font-medium">{lastResult.result.markedAsTransfer}</span> transfer,{" "}
            <span className="font-medium">{lastResult.result.movedToReview}</span> in &quot;Da rivedere&quot;.
          </div>
          {lastResult.result.changes.length > 0 && (
            <button
              type="button"
              onClick={() => setChangesOpen(true)}
              className="inline-flex items-center justify-between gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-muted transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                Vedi cambiamenti applicati
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {lastResult.result.changes.length}{" "}
                {lastResult.result.changes.length === 1 ? "gruppo" : "gruppi"}
              </span>
            </button>
          )}
        </div>
      )}

      {lastResult && !lastResult.ok && (
        <div className="flex items-start gap-2 border-t border-border pt-4 text-xs text-danger">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {lastResult.error}
        </div>
      )}

      {/* Drawer secondario: dettaglio cambiamenti applicati (stacked sopra) */}
      {lastResult?.ok && (
        <PushDrawer
          open={changesOpen}
          onClose={() => setChangesOpen(false)}
          stacked
          backLabel="Sincronizza categorie"
          title="Cambiamenti applicati"
          subtitle={`${lastResult.result.changes.length} ${
            lastResult.result.changes.length === 1 ? "gruppo" : "gruppi"
          } di movimenti spostati`}

        >
          <ChangesReport changes={lastResult.result.changes} />
        </PushDrawer>
      )}
    </div>
  );
}

type ApplyRulesOk = Extract<ApplyRulesActionResult, { ok: true }>;
type ChangeGroup = ApplyRulesOk["result"]["changes"][number];


function ChangesReport({ changes }: { changes: ChangeGroup[] }) {
  const totalMoved = changes.reduce((s, c) => s + c.count, 0);
  return (
    <div className="flex flex-col">
      <div className="py-2 text-xs text-muted-foreground">
        {totalMoved} {totalMoved === 1 ? "movimento spostato" : "movimenti spostati"}
      </div>
      <div className="flex flex-col">
        {changes.map((c, i) => (
          <ChangeGroupRow key={i} group={c} />
        ))}
      </div>
    </div>
  );
}

function ChangeGroupRow({ group }: { group: ChangeGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center justify-between gap-2 cursor-pointer group"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 inline-flex items-center gap-1.5">
            {group.fromLabel}
            <ArrowRight className="h-3 w-3" />
            <span className="text-foreground normal-case font-medium tracking-normal">
              {group.toLabel}
            </span>
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {group.count}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-md border border-border bg-muted/20 overflow-hidden">
          {group.examples.map((ex) => (
            <li
              key={ex.id}
              className="px-3 py-2 text-xs flex items-center gap-2"
            >
              <span className="text-muted-foreground tabular-nums w-16 shrink-0">
                {formatDate(new Date(ex.date))}
              </span>
              <span className="flex-1 truncate text-foreground">
                {ex.description}
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {formatCurrency(parseFloat(ex.amount))}
              </span>
            </li>
          ))}
          {group.count > group.examples.length && (
            <li className="px-3 py-2 text-xs text-muted-foreground italic">
              … e altri {group.count - group.examples.length}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

