"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, X, Check, ChevronDown } from "lucide-react";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { PeriodFilter } from "@/components/ui/period-filter";
import {
  periodFromSearchParams,
  periodToQueryString,
  type PeriodValue,
} from "@/lib/period";
import { cn } from "@/lib/utils";

type CategoryOpt = {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string | null;
};
type AccountOpt = { id: string; name: string };

type Initial = {
  type: "income" | "expense" | undefined;
  accountId: string | undefined;
  categoryIds: string[];
  search: string;
  period: PeriodValue;
};

export function FilterBar({
  categories,
  accounts,
  initial,
}: {
  categories: CategoryOpt[];
  accounts: AccountOpt[];
  initial: Initial;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(initial.search);

  function buildUrl(
    patch: Partial<Record<string, string | string[] | undefined | null>>,
  ) {
    const params = new URLSearchParams();
    for (const [k, v] of sp.entries()) {
      if (k in patch) continue;
      params.append(k, v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) {
        for (const x of v) params.append(k, x);
      } else {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    return `/movimenti${qs ? `?${qs}` : ""}`;
  }

  function pushPatch(
    patch: Partial<Record<string, string | string[] | undefined | null>>,
  ) {
    router.push(buildUrl(patch));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushPatch({ search: search.trim() || undefined });
  }

  function setPeriod(p: PeriodValue) {
    // Period gestisce 4 param: period, month, from, to. Devo prima azzerarli tutti.
    const cleared = {
      period: undefined as string | undefined,
      month: undefined as string | undefined,
      from: undefined as string | undefined,
      to: undefined as string | undefined,
    };
    if (p.kind === "all") {
      pushPatch(cleared);
      return;
    }
    cleared.period = p.kind;
    if (p.kind === "month") cleared.month = p.month;
    if (p.kind === "range") {
      cleared.from = p.from;
      cleared.to = p.to;
    }
    pushPatch(cleared);
  }

  const hasAnyFilter =
    initial.type !== undefined ||
    initial.accountId !== undefined ||
    initial.categoryIds.length > 0 ||
    !!initial.search ||
    initial.period.kind !== "all";

  const typeOptions: FilterOption<"all" | "income" | "expense">[] = [
    { value: "all", label: "Tipo: tutti" },
    { value: "income", label: "↑ Entrate" },
    { value: "expense", label: "↓ Uscite" },
  ];
  const accountOptions: FilterOption<string>[] = [
    { value: "", label: "Conto: tutti" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

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
            placeholder="Cerca descrizione…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </form>

      <PeriodFilter value={initial.period} onChange={setPeriod} />

      <FilterButton
        label="Tipo"
        options={typeOptions}
        value={initial.type ?? "all"}
        onChange={(v) =>
          pushPatch({ type: v === "all" ? undefined : v })
        }
      />

      <FilterButton
        label="Conto"
        options={accountOptions}
        value={initial.accountId ?? ""}
        onChange={(v) => pushPatch({ accountId: v || undefined })}
      />

      <CategoryMultiFilter
        categories={categories}
        selectedIds={initial.categoryIds}
        onChange={(ids) => pushPatch({ categoryIds: ids.length > 0 ? ids : undefined })}
      />

      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => router.push("/movimenti")}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
        >
          <X className="h-3 w-3" /> Reset
        </button>
      )}
    </div>
  );
}

// ===================================================================
// CATEGORY MULTI-SELECT (popover con checkbox + search)
// ===================================================================

function CategoryMultiFilter({
  categories,
  selectedIds,
  onChange,
}: {
  categories: CategoryOpt[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const isActive = selectedIds.length > 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const incomes = filtered.filter((c) => c.type === "income");
  const expenses = filtered.filter((c) => c.type === "expense");

  const valueLabel = isActive
    ? selectedIds.length === 1
      ? categories.find((c) => c.id === selectedIds[0])?.name ?? null
      : `${selectedIds.length} categorie`
    : null;

  function toggle(id: string) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          isActive
            ? "border-foreground bg-foreground text-background hover:opacity-90"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        <span className={cn("opacity-70", isActive && "text-background/80")}>
          Categoria:
        </span>
        <span className="font-medium max-w-32 truncate">{valueLabel ?? "Tutte"}</span>
        {isActive && (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clear(e as unknown as React.MouseEvent);
              }
            }}
            className="ml-0.5 -mr-1 p-0.5 rounded hover:bg-background/20 cursor-pointer"
            aria-label="Rimuovi filtro"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {!isActive && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        <div className="absolute z-40 left-0 mt-1 w-64 rounded-md border border-border bg-background shadow-lg p-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca categoria…"
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs mb-1.5"
          />
          <div className="max-h-72 overflow-auto">
            {incomes.length > 0 && (
              <Group label="Entrate" items={incomes} selected={selectedSet} onToggle={toggle} />
            )}
            {expenses.length > 0 && (
              <Group label="Uscite" items={expenses} selected={selectedSet} onToggle={toggle} />
            )}
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground p-2 text-center">
                Nessuna categoria
              </div>
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="border-t border-border mt-1.5 pt-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {selectedIds.length} selezionate
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-foreground hover:underline"
              >
                Deseleziona tutte
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: CategoryOpt[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-0.5">
        {label}
      </div>
      {items.map((c) => {
        const isOn = selected.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors",
              isOn ? "bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            <span className="h-3 w-3 rounded-sm border border-current inline-flex items-center justify-center shrink-0">
              {isOn && <Check className="h-2.5 w-2.5" />}
            </span>
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: c.color ?? "#a1a1aa" }}
            />
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ===================================================================
// Helper export per la page server
// ===================================================================
export { periodFromSearchParams, periodToQueryString };
