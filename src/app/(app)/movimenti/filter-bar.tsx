"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Search as SearchIcon,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CategoryOpt = { id: string; name: string; type: "income" | "expense"; color: string | null };
type AccountOpt = { id: string; name: string };

export function FilterBar({
  categories,
  accounts,
  initial,
}: {
  categories: CategoryOpt[];
  accounts: AccountOpt[];
  initial: {
    type: "income" | "expense" | undefined;
    accountId: string | undefined;
    categoryIds: string[];
    search: string;
    month: string;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(initial.search);

  function buildUrl(patch: Partial<Record<string, string | string[] | undefined>>) {
    const params = new URLSearchParams();
    // Riprendi tutti i param attuali
    for (const [k, v] of sp.entries()) {
      // Saltiamo quelli che stiamo per riscrivere
      if (k in patch) continue;
      params.append(k, v);
    }
    // Applica i nuovi
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") continue;
      if (Array.isArray(v)) {
        for (const x of v) params.append(k, x);
      } else {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    return `/movimenti${qs ? `?${qs}` : ""}`;
  }

  function pushPatch(patch: Partial<Record<string, string | string[] | undefined>>) {
    router.push(buildUrl(patch));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushPatch({ search: search.trim() || undefined });
  }

  const hasAnyFilter =
    !!initial.type ||
    !!initial.accountId ||
    initial.categoryIds.length > 0 ||
    !!initial.search ||
    !!initial.month;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-background">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 flex-1 min-w-48">
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

      <FilterChip
        label="Tipo"
        valueLabel={initial.type === "income" ? "Entrate" : initial.type === "expense" ? "Uscite" : null}
        onClear={() => pushPatch({ type: undefined })}
      >
        {(close) => (
          <div className="p-1 min-w-40">
            {[
              { value: undefined, label: "Tutti" },
              { value: "income" as const, label: "↑ Entrate" },
              { value: "expense" as const, label: "↓ Uscite" },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  pushPatch({ type: opt.value });
                  close();
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm hover:bg-muted text-left",
                  initial.type === opt.value && "font-medium",
                )}
              >
                <span>{opt.label}</span>
                {initial.type === opt.value && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </FilterChip>

      <FilterChip
        label="Conto"
        valueLabel={
          initial.accountId ? accounts.find((a) => a.id === initial.accountId)?.name ?? null : null
        }
        onClear={() => pushPatch({ accountId: undefined })}
      >
        {(close) => (
          <div className="p-1 min-w-48 max-h-72 overflow-auto">
            <button
              type="button"
              onClick={() => {
                pushPatch({ accountId: undefined });
                close();
              }}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm hover:bg-muted text-left",
                !initial.accountId && "font-medium",
              )}
            >
              <span>Tutti</span>
              {!initial.accountId && <Check className="h-3.5 w-3.5 text-blue-600" />}
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  pushPatch({ accountId: a.id });
                  close();
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm hover:bg-muted text-left",
                  initial.accountId === a.id && "font-medium",
                )}
              >
                <span className="truncate">{a.name}</span>
                {initial.accountId === a.id && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </FilterChip>

      <CategoryFilterChip
        categories={categories}
        selectedIds={initial.categoryIds}
        onChange={(ids) => pushPatch({ categoryIds: ids.length > 0 ? ids : undefined })}
      />

      <FilterChip
        label="Mese"
        valueLabel={initial.month ? formatMonthLabel(initial.month) : null}
        onClear={() => pushPatch({ month: undefined })}
      >
        {(close) => (
          <div className="p-2 min-w-44">
            <input
              type="month"
              defaultValue={initial.month}
              onChange={(e) => {
                pushPatch({ month: e.target.value || undefined });
                close();
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
        )}
      </FilterChip>

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
// GENERIC POPOVER CHIP
// ===================================================================

function FilterChip({
  label,
  valueLabel,
  onClear,
  children,
}: {
  label: string;
  valueLabel: string | null;
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const active = valueLabel != null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs",
          active
            ? "border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium max-w-32 truncate">{valueLabel ?? "Tutti"}</span>
        {active && onClear && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }
            }}
            className="ml-0.5 -mr-1 p-0.5 rounded hover:bg-blue-200 cursor-pointer"
            aria-label="Rimuovi filtro"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {!active && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute z-50 left-0 mt-1 rounded-md border border-border bg-background shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ===================================================================
// CATEGORY MULTI-SELECT (popup con checkbox + search)
// ===================================================================

function CategoryFilterChip({
  categories,
  selectedIds,
  onChange,
}: {
  categories: CategoryOpt[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const valueLabel =
    selectedIds.length === 0
      ? null
      : selectedIds.length === 1
        ? categories.find((c) => c.id === selectedIds[0])?.name ?? null
        : `${selectedIds.length} categorie`;

  function toggle(id: string) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const incomes = filtered.filter((c) => c.type === "income");
  const expenses = filtered.filter((c) => c.type === "expense");

  return (
    <FilterChip
      label="Categoria"
      valueLabel={valueLabel}
      onClear={() => onChange([])}
    >
      {() => (
        <div className="p-2 min-w-64">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca categoria…"
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs mb-1.5"
          />
          <div className="max-h-72 overflow-auto">
            {incomes.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-0.5">
                  Entrate
                </div>
                {incomes.map((c) => (
                  <CatOption key={c.id} c={c} checked={selectedSet.has(c.id)} onToggle={() => toggle(c.id)} />
                ))}
              </div>
            )}
            {expenses.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1.5 pb-0.5">
                  Uscite
                </div>
                {expenses.map((c) => (
                  <CatOption key={c.id} c={c} checked={selectedSet.has(c.id)} onToggle={() => toggle(c.id)} />
                ))}
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground p-2 text-center">Nessuna categoria</div>
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
                className="text-blue-700 hover:underline"
              >
                Deseleziona tutte
              </button>
            </div>
          )}
        </div>
      )}
    </FilterChip>
  );
}

function CatOption({
  c,
  checked,
  onToggle,
}: {
  c: CategoryOpt;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5"
      />
      <span
        className="inline-block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: c.color ?? "#a1a1aa" }}
      />
      <span className="truncate">{c.name}</span>
    </label>
  );
}

// ===================================================================
// UTILS
// ===================================================================

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return `${MONTH_LABELS[m - 1]} ${y}`;
}
