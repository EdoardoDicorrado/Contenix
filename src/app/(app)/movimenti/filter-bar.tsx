"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, X, Check, ChevronDown, Tag } from "lucide-react";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { OverlayModal } from "@/components/ui/overlay-modal";
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

      <CategoryMultiFilter
        categories={categories}
        selectedIds={initial.categoryIds}
        onChange={(ids) => pushPatch({ categoryIds: ids.length > 0 ? ids : undefined })}
      />

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
  // Selezione "staged" che NON viene applicata finché non si conferma
  const [staged, setStaged] = useState<string[]>(selectedIds);

  const isActive = selectedIds.length > 0;

  // Quando si apre il modal, si sincronizza con i filtri attivi
  function openModal() {
    setStaged(selectedIds);
    setSearch("");
    setOpen(true);
  }

  const stagedSet = useMemo(() => new Set(staged), [staged]);

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

  function toggleStaged(id: string) {
    setStaged((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAll(items: CategoryOpt[]) {
    const ids = items.map((c) => c.id);
    setStaged((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function deselectAll(items: CategoryOpt[]) {
    const ids = new Set(items.map((c) => c.id));
    setStaged((prev) => prev.filter((id) => !ids.has(id)));
  }

  function applyStaged() {
    onChange(staged);
    setOpen(false);
  }

  function clearFromChip(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
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
            onClick={clearFromChip}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clearFromChip(e as unknown as React.MouseEvent);
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
        <OverlayModal
          title="Filtra per categoria"
          icon={<Tag className="h-4 w-4 text-foreground" />}
          onClose={() => setOpen(false)}
          size="xl"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca categoria…"
                  className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {staged.length} selezionate
              </span>
            </div>

            <div className="flex flex-col gap-4 max-h-[60vh] overflow-auto pr-1">
              {expenses.length > 0 && (
                <CategoryCardGroup
                  label="Uscite"
                  items={expenses}
                  selected={stagedSet}
                  onToggle={toggleStaged}
                  onSelectAll={() => selectAll(expenses)}
                  onDeselectAll={() => deselectAll(expenses)}
                />
              )}
              {incomes.length > 0 && (
                <CategoryCardGroup
                  label="Entrate"
                  items={incomes}
                  selected={stagedSet}
                  onToggle={toggleStaged}
                  onSelectAll={() => selectAll(incomes)}
                  onDeselectAll={() => deselectAll(incomes)}
                />
              )}
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground p-6 text-center">
                  Nessuna categoria con &quot;{search}&quot;.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setStaged([])}
                disabled={staged.length === 0}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Deseleziona tutte
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={applyStaged}
                  className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 font-medium"
                >
                  Conferma ({staged.length})
                </button>
              </div>
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}

function CategoryCardGroup({
  label,
  items,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  label: string;
  items: CategoryOpt[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const allSelected = items.every((c) => selected.has(c.id));
  const someSelected = items.some((c) => selected.has(c.id));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label} ({items.length})
        </span>
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-[11px] text-foreground hover:underline"
        >
          {allSelected
            ? "Deseleziona tutte"
            : someSelected
              ? `Seleziona altre ${items.length - items.filter((c) => selected.has(c.id)).length}`
              : "Seleziona tutte"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {items.map((c) => {
          const isOn = selected.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              className={cn(
                "rounded-md border p-2.5 text-left transition-colors flex items-start gap-2 min-h-[60px]",
                isOn
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-sm border inline-flex items-center justify-center shrink-0 mt-0.5",
                  isOn ? "border-background bg-background/20" : "border-current",
                )}
              >
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color ?? "#a1a1aa" }}
                  />
                  <span className="text-sm font-medium truncate">{c.name}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
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
