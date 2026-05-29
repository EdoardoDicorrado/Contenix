"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Tag,
  Users,
  Link2,
  History,
  Trash2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import {
  clearSyncHistory,
  getSyncHistory,
  type SyncRunEntry,
  type SyncRunType,
} from "@/lib/sync-history";
import type { ApplyRulesResult } from "@/lib/db/queries/apply-rules";
import type { ApplyEmployeeResult } from "@/lib/db/queries/apply-employee-allocation";
import type { ApplyInvoiceMatchesResult } from "@/lib/db/queries/apply-invoice-matches";

type CategoriesEntry = SyncRunEntry<ApplyRulesResult> & { type: "categories" };
type EmployeesEntry = SyncRunEntry<ApplyEmployeeResult> & { type: "employees" };
type InvoicesEntry = SyncRunEntry<ApplyInvoiceMatchesResult> & { type: "invoices" };
type Entry = CategoriesEntry | EmployeesEntry | InvoicesEntry;

/**
 * Vista client dello storico sincronizzazioni: aggrega categorie + dipendenti
 * leggendo da localStorage (via lib/sync-history). Lista cronologica con
 * il run più recente in cima.
 */
export function SyncHistoryView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const cats = getSyncHistory<ApplyRulesResult>("categories").map<CategoriesEntry>(
      (e) => ({ ...e, type: "categories" }),
    );
    const emps = getSyncHistory<ApplyEmployeeResult>("employees").map<EmployeesEntry>(
      (e) => ({ ...e, type: "employees" }),
    );
    const invs = getSyncHistory<ApplyInvoiceMatchesResult>("invoices").map<InvoicesEntry>(
      (e) => ({ ...e, type: "invoices" }),
    );
    const merged: Entry[] = [...cats, ...emps, ...invs].sort((a, b) =>
      b.ranAt.localeCompare(a.ranAt),
    );
    setEntries(merged);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleClear(type: SyncRunType) {
    const labelMap: Record<SyncRunType, string> = {
      categories: "categorie",
      employees: "dipendenti",
      invoices: "match fatture",
    };
    if (!confirm(`Cancellare lo storico ${labelMap[type]}?`)) return;
    clearSyncHistory(type);
    setEntries((prev) => prev.filter((e) => e.type !== type));
  }

  if (!hydrated) {
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        Caricamento storico…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-12 text-center flex flex-col items-center gap-3">
        <History className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Nessuna sincronizzazione registrata</p>
          <p className="text-xs text-muted-foreground mt-1">
            Avvia una sincronizzazione da{" "}
            <Link href="/regole" className="text-foreground hover:underline">
              Regole
            </Link>
            ,{" "}
            <Link href="/movimenti" className="text-foreground hover:underline">
              Movimenti
            </Link>
            ,{" "}
            <Link href="/categorie" className="text-foreground hover:underline">
              Categorie
            </Link>{" "}
            o{" "}
            <Link href="/dipendenti" className="text-foreground hover:underline">
              Dipendenti
            </Link>{" "}
            per vederla qui.
          </p>
        </div>
      </div>
    );
  }

  const hasCategories = entries.some((e) => e.type === "categories");
  const hasEmployees = entries.some((e) => e.type === "employees");
  const hasInvoices = entries.some((e) => e.type === "invoices");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-3 text-xs flex-wrap">
        {hasCategories && (
          <button
            type="button"
            onClick={() => handleClear("categories")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Pulisci categorie
          </button>
        )}
        {hasEmployees && (
          <button
            type="button"
            onClick={() => handleClear("employees")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Pulisci dipendenti
          </button>
        )}
        {hasInvoices && (
          <button
            type="button"
            onClick={() => handleClear("invoices")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Pulisci match fatture
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li key={`${e.type}-${e.ranAt}-${i}`}>
            <EntryRow entry={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const date = new Date(entry.ranAt);
  const icon =
    entry.type === "categories" ? (
      <Tag className="h-4 w-4" />
    ) : entry.type === "employees" ? (
      <Users className="h-4 w-4" />
    ) : (
      <Link2 className="h-4 w-4" />
    );
  const title =
    entry.type === "categories"
      ? "Sincronizzazione categorie"
      : entry.type === "employees"
        ? "Allocazione dipendenti"
        : "Match fatture";

  return (
    <div className="rounded-lg border border-border bg-background p-4 flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelative(date)}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            · {date.toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {entry.type === "categories" ? (
          <CategoriesSummary result={entry.result} />
        ) : entry.type === "employees" ? (
          <EmployeesSummary result={entry.result} />
        ) : (
          <InvoicesSummary result={entry.result} />
        )}
      </div>
    </div>
  );
}

function InvoicesSummary({ result }: { result: ApplyInvoiceMatchesResult }) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
      <span>
        Esaminate <Stat>{result.totalScanned}</Stat>
      </span>
      <span>
        Match auto <Stat tone="success">{result.autoMatched}</Stat>
      </span>
      <span>
        Da revisionare <Stat>{result.needsReview}</Stat>
      </span>
      <span>
        Senza candidati <Stat>{result.noCandidate}</Stat>
      </span>
      {result.autoMatched === 0 && result.needsReview === 0 && (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" />
          Nessuna nuova fattura da matchare
        </span>
      )}
    </div>
  );
}

function CategoriesSummary({ result }: { result: ApplyRulesResult }) {
  const totalChanges = result.categorized + result.markedAsTransfer + result.movedToReview;
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
      <span>
        Scansionati <Stat>{result.totalScanned}</Stat>
      </span>
      <span>
        Categorizzati <Stat tone="success">{result.categorized}</Stat>
      </span>
      <span>
        Trasferimenti <Stat>{result.markedAsTransfer}</Stat>
      </span>
      <span>
        Da rivedere{" "}
        <Stat tone={result.movedToReview > 0 ? "danger" : "neutral"}>
          {result.movedToReview}
        </Stat>
      </span>
      {totalChanges === 0 && (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" />
          Nessun cambiamento
        </span>
      )}
      {result.changes.length > 0 && (
        <Link
          href="/storico-cambiamenti"
          className="text-foreground hover:underline inline-flex items-center gap-0.5 ml-auto"
        >
          Dettaglio cambiamenti <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function EmployeesSummary({ result }: { result: ApplyEmployeeResult }) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
      <span>
        Scansionati <Stat>{result.totalScanned}</Stat>
      </span>
      <span>
        Nuovi allocati <Stat tone="success">{result.allocated}</Stat>
      </span>
      <span>
        Invariati <Stat>{result.unchanged}</Stat>
      </span>
      {result.groups.length > 0 && (
        <span>
          Dipendenti coinvolti <Stat>{result.groups.length}</Stat>
        </span>
      )}
      {result.allocated === 0 && (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" />
          Nessuna nuova allocazione
        </span>
      )}
    </div>
  );
}

function Stat({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-foreground";
  return <span className={`font-semibold tabular-nums ${color}`}>{children}</span>;
}
