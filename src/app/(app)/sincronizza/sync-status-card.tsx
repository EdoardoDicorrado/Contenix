"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Tag,
  ArrowLeftRight,
  HelpCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { applyRulesAction, type ApplyRulesActionResult } from "../regole/actions";

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
    <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox
          icon={<HelpCircle className="h-3.5 w-3.5" />}
          label="Totale"
          value={stats.total}
          accent="neutral"
        />
        <StatBox
          icon={<Tag className="h-3.5 w-3.5" />}
          label="Categorizzati"
          value={stats.categorized}
          accent="green"
        />
        <StatBox
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
          label="Trasferimenti"
          value={stats.transfers}
          accent="blue"
        />
        <StatBox
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="Senza categoria"
          value={stats.unmatched}
          accent={stats.unmatched > 0 ? "amber" : "neutral"}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={overrideExisting}
            onChange={(e) => setOverrideExisting(e.target.checked)}
            disabled={pending}
          />
          <span>
            Sovrascrivi categorizzazioni esistenti{" "}
            <span className="text-muted-foreground">
              (riapplica anche ai movimenti già categorizzati)
            </span>
          </span>
        </label>

        <Button onClick={handleApply} disabled={pending} className="gap-2 shrink-0">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {pending ? "Riapplicazione…" : "Riapplica regole"}
        </Button>
      </div>

      {lastResult?.ok && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-green-900 flex-wrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-700 shrink-0" />
            <span>
              Ultimo run{ranAt ? ` (${formatRunTime(ranAt)})` : ""}:{" "}
              {lastResult.result.totalScanned} scansionati,{" "}
              <span className="font-medium">{lastResult.result.categorized}</span> categorizzati,{" "}
              <span className="font-medium">{lastResult.result.markedAsTransfer}</span> marcati transfer,{" "}
              <span className="font-medium">{lastResult.result.movedToReview}</span> spostati in &quot;Da rivedere&quot;.
            </span>
            <button
              type="button"
              onClick={clearLastResult}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
              title="Nascondi il report finché non rilanci"
            >
              Pulisci
            </button>
          </div>
          {lastResult.result.changes.length > 0 && (
            <ChangesReport changes={lastResult.result.changes} />
          )}
        </div>
      )}

      {lastResult && !lastResult.ok && (
        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-red-900">
          <AlertCircle className="h-3.5 w-3.5" />
          {lastResult.error}
        </div>
      )}
    </div>
  );
}

type ApplyRulesOk = Extract<ApplyRulesActionResult, { ok: true }>;
type ChangeGroup = ApplyRulesOk["result"]["changes"][number];

function formatRunTime(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "appena ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ChangesReport({ changes }: { changes: ChangeGroup[] }) {
  const totalMoved = changes.reduce((s, c) => s + c.count, 0);
  return (
    <details className="rounded-md border border-border bg-muted/30">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/50 rounded-md">
        <span className="flex items-center gap-1.5 text-foreground font-medium">
          <ArrowRight className="h-3 w-3 text-blue-600" />
          Vedi cambiamenti ({totalMoved} movimenti spostati, {changes.length}{" "}
          {changes.length === 1 ? "gruppo" : "gruppi"})
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground group-open:rotate-180 transition-transform" />
      </summary>
      <div className="px-2 pb-2 pt-1 flex flex-col gap-1">
        {changes.map((c, i) => (
          <ChangeGroupRow key={i} group={c} />
        ))}
      </div>
    </details>
  );
}

function ChangeGroupRow({ group }: { group: ChangeGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-background border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-muted/30 rounded-md"
      >
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">{group.fromLabel}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{group.toLabel}</span>
          <span className="text-muted-foreground">· {group.count}</span>
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul className="border-t border-border divide-y divide-border">
          {group.examples.map((ex) => (
            <li key={ex.id} className="px-3 py-1 text-[11px] flex items-center gap-2">
              <span className="text-muted-foreground tabular-nums w-16 shrink-0">
                {formatDate(new Date(ex.date))}
              </span>
              <span className="flex-1 truncate text-foreground">{ex.description}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {formatCurrency(parseFloat(ex.amount))}
              </span>
            </li>
          ))}
          {group.count > group.examples.length && (
            <li className="px-3 py-1 text-[11px] text-muted-foreground italic">
              … e altri {group.count - group.examples.length}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "green" | "blue" | "amber" | "neutral";
}) {
  const accentClass = {
    green: "text-green-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    neutral: "text-muted-foreground",
  }[accent];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className={`flex items-center gap-1.5 text-[11px] ${accentClass}`}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
