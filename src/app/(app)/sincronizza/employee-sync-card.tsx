"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  UserCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import { appendSyncRun } from "@/lib/sync-history";
import {
  applyEmployeeAllocationAction,
  type ApplyEmployeeActionResult,
} from "./employee-actions";

const STORAGE_KEY = "sync-last-employee-result";

type PersistedResult = {
  ranAt: string;
  result: Extract<ApplyEmployeeActionResult, { ok: true }>["result"];
};

export type EmployeeStats = {
  total: number;
  allocated: number;
  unallocated: number;
};

export function EmployeeSyncCard({ stats }: { stats: EmployeeStats }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyEmployeeActionResult | null>(null);
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
      // ignora errori di parsing
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleApply() {
    startTransition(async () => {
      const res = await applyEmployeeAllocationAction({ overrideExisting });
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
        appendSyncRun("employees", res.result);
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
      <div className="grid grid-cols-3 gap-3">
        <StatBox
          icon={<HelpCircle className="h-3.5 w-3.5" />}
          label="Totale movimenti"
          value={stats.total}
          accent="neutral"
        />
        <StatBox
          icon={<UserCheck className="h-3.5 w-3.5" />}
          label="Con dipendente"
          value={stats.allocated}
          accent="green"
        />
        <StatBox
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="Senza dipendente"
          value={stats.unallocated}
          accent={stats.unallocated > 0 ? "amber" : "neutral"}
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
            Sovrascrivi allocazioni esistenti{" "}
            <span className="text-muted-foreground">
              (riassegna anche i movimenti già allocati)
            </span>
          </span>
        </label>

        <Button onClick={handleApply} disabled={pending} className="gap-2 shrink-0">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          {pending ? "Allocazione…" : "Alloca dipendenti"}
        </Button>
      </div>

      {lastResult?.ok && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-green-900 flex-wrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-700 shrink-0" />
            <span>
              Ultimo run{ranAt ? ` (${formatRelative(ranAt)})` : ""}:{" "}
              {lastResult.result.totalScanned} scansionati,{" "}
              <span className="font-medium">{lastResult.result.allocated}</span> nuovi allocati,{" "}
              <span className="font-medium">{lastResult.result.unchanged}</span> invariati.
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
          {lastResult.result.groups.length > 0 && (
            <AllocationReport groups={lastResult.result.groups} />
          )}
        </div>
      )}

      {lastResult && !lastResult.ok && (
        <div className="flex items-start gap-2 border-t border-border pt-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {lastResult.error}
        </div>
      )}
    </div>
  );
}

type ApplyEmployeeOk = Extract<ApplyEmployeeActionResult, { ok: true }>;
type AllocationGroup = ApplyEmployeeOk["result"]["groups"][number];

function AllocationReport({ groups }: { groups: AllocationGroup[] }) {
  const total = groups.reduce((s, g) => s + g.count, 0);
  return (
    <details className="rounded-md border border-border bg-muted/30">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/50 rounded-md">
        <span className="flex items-center gap-1.5 text-foreground font-medium">
          <ArrowRight className="h-3 w-3 text-blue-600" />
          Vedi allocazioni ({total} movimenti su {groups.length}{" "}
          {groups.length === 1 ? "dipendente" : "dipendenti"})
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </summary>
      <div className="px-2 pb-2 pt-1 flex flex-col gap-1">
        {groups.map((g) => (
          <AllocationGroupRow key={g.employeeId} group={g} />
        ))}
      </div>
    </details>
  );
}

function AllocationGroupRow({ group }: { group: AllocationGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-background border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-muted/30 rounded-md"
      >
        <span className="flex items-center gap-1.5 flex-wrap">
          <UserCheck className="h-3 w-3 text-blue-600" />
          <span className="font-medium">{group.employeeName}</span>
          <span className="text-muted-foreground">
            · {group.count} mov. · {formatCurrency(group.totalAmount)}
          </span>
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
  const valueClass =
    accent === "green" && value > 0
      ? "text-success"
      : accent === "amber" && value > 0
        ? "text-danger"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

