"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, X } from "lucide-react";
import {
  FilterButton,
  type FilterOption,
} from "@/components/ui/filter-button";
import { PeriodFilter } from "@/components/ui/period-filter";
import { periodToQueryString, type PeriodValue } from "@/lib/period";

type TypeFilter = "" | "purchase" | "sale";
type StatusFilter = "" | "pending" | "partial" | "paid" | "overdue" | "cancelled";

const TYPE_OPTIONS: FilterOption<TypeFilter>[] = [
  { value: "", label: "Tipo: tutti" },
  { value: "sale", label: "↑ Vendite" },
  { value: "purchase", label: "↓ Acquisti" },
];

const STATUS_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: "", label: "Stato: tutti" },
  { value: "pending", label: "Da pagare" },
  { value: "partial", label: "Parziale" },
  { value: "paid", label: "Pagata" },
  { value: "overdue", label: "Scaduta" },
  { value: "cancelled", label: "Annullata" },
];

export function FattureFilterBar({
  initial,
}: {
  initial: {
    type: TypeFilter;
    status: StatusFilter;
    search: string;
    period: PeriodValue;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(initial.search);

  function buildUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const [k, v] of sp.entries()) {
      if (k in patch) continue;
      params.append(k, v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/fatture${qs ? `?${qs}` : ""}`;
  }

  function pushPatch(patch: Record<string, string | undefined>) {
    router.push(buildUrl(patch));
  }

  function setPeriod(p: PeriodValue) {
    // Reset di tutti i param period e applica i nuovi
    const cleared: Record<string, string | undefined> = {
      period: undefined,
      month: undefined,
      from: undefined,
      to: undefined,
      year: undefined,
      quarter: undefined,
    };
    if (p.kind !== "all") {
      cleared.period = p.kind;
      if (p.kind === "month") cleared.month = p.month;
      if (p.kind === "range") {
        cleared.from = p.from;
        cleared.to = p.to;
      }
      if (p.year != null) cleared.year = String(p.year);
      if (p.quarter != null) cleared.quarter = String(p.quarter);
    }
    pushPatch(cleared);
    // periodToQueryString è qui solo per coerenza (non usata direttamente)
    void periodToQueryString(p);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushPatch({ search: search.trim() || undefined });
  }

  const hasAnyFilter =
    !!initial.type ||
    !!initial.status ||
    !!initial.search ||
    initial.period.kind !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-background">
      <form
        onSubmit={handleSearchSubmit}
        className="flex items-center gap-1 flex-1 min-w-48"
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca controparte…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </form>

      <PeriodFilter value={initial.period} onChange={setPeriod} />

      <FilterButton
        label="Tipo"
        options={TYPE_OPTIONS}
        value={initial.type}
        onChange={(v) => pushPatch({ type: v || undefined })}
      />

      <FilterButton
        label="Stato"
        options={STATUS_OPTIONS}
        value={initial.status}
        onChange={(v) => pushPatch({ status: v || undefined })}
        overlayTitle="Filtra per stato"
      />

      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => router.push("/fatture")}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
        >
          <X className="h-3 w-3" /> Reset
        </button>
      )}
    </div>
  );
}
