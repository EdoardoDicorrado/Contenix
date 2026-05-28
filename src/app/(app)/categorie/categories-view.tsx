"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search as SearchIcon,
  X,
  Pencil,
  Trash2,
  Tag,
  ArrowUp,
  ArrowDown,
  Loader2,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { formatCurrency } from "@/lib/utils";
import { deleteCategoryAction } from "./actions";

export type CategoryWithStats = {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string | null;
  movementsCount: number;
  total: string;
  rulesCount: number;
  lastMovementAt: Date | null;
};

type SortMode =
  | "alpha-asc"
  | "alpha-desc"
  | "count-desc"
  | "count-asc"
  | "total-desc"
  | "total-asc"
  | "recent";

type TypeFilter = "all" | "income" | "expense";

type Period = "month" | "quarter" | "ytd" | "year" | "all";

const PERIOD_OPTIONS: FilterOption<Period>[] = [
  { value: "all", label: "Sempre", description: "Tutto lo storico." },
  { value: "month", label: "Mese corrente", description: "Solo il mese in corso." },
  { value: "quarter", label: "Ultimi 3 mesi", description: "Il mese corrente più i due precedenti." },
  { value: "ytd", label: "Anno corrente", description: "Da gennaio fino a oggi." },
  { value: "year", label: "Ultimi 12 mesi", description: "Finestra mobile di 12 mesi." },
];

const TYPE_OPTIONS: FilterOption<TypeFilter>[] = [
  { value: "all", label: "Tipo: tutti" },
  { value: "expense", label: "Solo uscite" },
  { value: "income", label: "Solo entrate" },
];

const SORT_OPTIONS: FilterOption<SortMode>[] = [
  { value: "total-desc", label: "Costo: più alto", description: "Le categorie più onerose nel periodo selezionato." },
  { value: "total-asc", label: "Costo: più basso" },
  { value: "count-desc", label: "Più movimenti" },
  { value: "count-asc", label: "Meno movimenti" },
  { value: "recent", label: "Ultimo movimento", description: "Quelle usate più di recente." },
  { value: "alpha-asc", label: "A → Z" },
  { value: "alpha-desc", label: "Z → A" },
];

export function CategoriesView({
  categories,
  currentPeriod,
  periodLabel,
}: {
  categories: CategoryWithStats[];
  currentPeriod: Period;
  periodLabel: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // Default: ordina per costo più alto (quello che l'utente vuole vedere)
  const [sort, setSort] = useState<SortMode>("total-desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  function setPeriod(p: Period) {
    const url = p === "all" ? "/categorie" : `/categorie?period=${p}`;
    router.push(url);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = categories;
    if (q) arr = arr.filter((c) => c.name.toLowerCase().includes(q));
    if (typeFilter !== "all") arr = arr.filter((c) => c.type === typeFilter);

    const compare = (a: CategoryWithStats, b: CategoryWithStats) => {
      switch (sort) {
        case "alpha-asc":
          return a.name.localeCompare(b.name);
        case "alpha-desc":
          return b.name.localeCompare(a.name);
        case "count-asc":
          return a.movementsCount - b.movementsCount;
        case "count-desc":
          return b.movementsCount - a.movementsCount;
        case "total-asc":
          return parseFloat(a.total) - parseFloat(b.total);
        case "total-desc":
          return parseFloat(b.total) - parseFloat(a.total);
        case "recent": {
          const ta = a.lastMovementAt?.getTime() ?? 0;
          const tb = b.lastMovementAt?.getTime() ?? 0;
          return tb - ta;
        }
        default:
          return 0;
      }
    };

    return [...arr].sort(compare);
  }, [categories, search, sort, typeFilter]);

  const expenses = filtered.filter((c) => c.type === "expense");
  const incomes = filtered.filter((c) => c.type === "income");

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca categoria…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Pulisci"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <FilterButton
          label="Periodo"
          options={PERIOD_OPTIONS}
          value={currentPeriod}
          onChange={setPeriod}
          overlayTitle="Seleziona periodo"
          overlayIcon={<Calendar className="h-4 w-4 text-blue-600" />}
        />

        <FilterButton
          label="Tipo"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={setTypeFilter}
        />

        <FilterButton
          label="Ordina"
          options={SORT_OPTIONS}
          value={sort}
          onChange={setSort}
          overlayTitle="Ordina categorie per"
          overlayIcon={<ArrowUpDown className="h-4 w-4 text-blue-600" />}
        />

        <span className="text-xs text-muted-foreground ml-auto">
          <span className="text-foreground font-medium">{filtered.length}</span>/{categories.length} categorie
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          Nessuna categoria con questi filtri.
        </div>
      ) : (
        <>
          {/* Uscite SOPRA */}
          {(typeFilter === "all" || typeFilter === "expense") && expenses.length > 0 && (
            <Section
              title="Uscite"
              icon={<ArrowDown className="h-4 w-4 text-danger" />}
              count={expenses.length}
              items={expenses}
              periodLabel={periodLabel}
            />
          )}

          {/* Entrate SOTTO */}
          {(typeFilter === "all" || typeFilter === "income") && incomes.length > 0 && (
            <Section
              title="Entrate"
              icon={<ArrowUp className="h-4 w-4 text-success" />}
              count={incomes.length}
              items={incomes}
              periodLabel={periodLabel}
            />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  items,
  periodLabel,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  periodLabel: string;
  items: CategoryWithStats[];
}) {
  const totalAmount = items.reduce((s, c) => s + parseFloat(c.total), 0);
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-medium">{title}</h3>
          <Badge tone="neutral" className="text-[10px]">
            {count}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Totale {periodLabel.toLowerCase()}{" "}
          <span className="font-medium text-foreground">{formatCurrency(totalAmount)}</span>
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((c) => (
          <CategoryCard key={c.id} category={c} />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({ category }: { category: CategoryWithStats }) {
  const router = useRouter();
  const [deleting, startDeleteTransition] = useTransition();
  const total = parseFloat(category.total);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Eliminare "${category.name}"? I ${category.movementsCount} movimenti perderanno la categoria (verranno marcati "Da rivedere"). Le regole collegate vengono cancellate.`,
      )
    )
      return;
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.append("id", category.id);
      await deleteCategoryAction(fd);
      router.refresh();
    });
  }

  return (
    <Link
      href={`/movimenti?categoryIds=${category.id}`}
      className="group rounded-lg border border-border bg-background p-3 hover:border-blue-400 hover:bg-muted/30 transition-colors flex flex-col gap-2 min-w-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: category.color ?? "#a1a1aa" }}
        />
        <span className="text-sm font-medium truncate flex-1">{category.name}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Link
            href={`/categorie/${category.id}/modifica`}
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Modifica"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 disabled:opacity-50"
            aria-label="Elimina"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">{category.movementsCount}</span>{" "}
          {category.movementsCount === 1 ? "movimento" : "movimenti"}
        </span>
        {category.rulesCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" />
            <span className="text-foreground font-medium">{category.rulesCount}</span>{" "}
            {category.rulesCount === 1 ? "regola" : "regole"}
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between mt-auto pt-1 border-t border-border">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Totale
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            category.type === "income" ? "text-success" : "text-danger"
          }`}
        >
          {category.type === "income" ? "+" : "−"}
          {formatCurrency(total)}
        </span>
      </div>
    </Link>
  );
}
