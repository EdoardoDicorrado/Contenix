"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  ArrowRight,
  Loader2,
  Tag,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import {
  deleteCategoryRuleAction,
  moveCategoryRuleAction,
} from "./actions";

export type Rule = {
  id: string;
  pattern: string;
  categoryId: string;
  categoryName: string | null;
  categoryColor: string | null;
  categoryType: "income" | "expense" | null;
  movementType: "income" | "expense" | null;
  matchCount: number;
  createdAt: Date;
  lastMatchedAt: Date | null;
};

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string | null;
};

type SortMode =
  | "rules-desc" // Più regole per categoria (default)
  | "alpha-asc" // A → Z
  | "alpha-desc" // Z → A
  | "match-desc" // Match desc
  | "match-asc" // Match asc
  | "recent"; // Modificate di recente

const SORT_LABELS: Record<SortMode, string> = {
  "rules-desc": "Più regole",
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "match-desc": "Match: più → meno",
  "match-asc": "Match: meno → più",
  recent: "Ultima modifica",
};

export function RulesByCategory({
  rules,
  categories,
}: {
  rules: Rule[];
  categories: Category[];
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("rules-desc");

  // Filtro client-side: match su pattern, nome categoria, type
  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(q) ||
        (r.categoryName?.toLowerCase().includes(q) ?? false),
    );
  }, [rules, search]);

  // Raggruppa per categoryId
  const byCategoryId = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const r of filteredRules) {
      if (!map.has(r.categoryId)) map.set(r.categoryId, []);
      map.get(r.categoryId)!.push(r);
    }
    return map;
  }, [filteredRules]);

  // Cards: una per categoria con regole filtrate. Ordina secondo `sort` sia
  // l'elenco delle card sia le regole dentro ognuna.
  const cards = useMemo(() => {
    const list: Array<{ category: Category; rules: Rule[] }> = [];
    for (const cat of categories) {
      const catRules = byCategoryId.get(cat.id);
      if (catRules && catRules.length > 0) {
        list.push({ category: cat, rules: catRules });
      }
    }
    const orphans: Rule[] = [];
    for (const r of filteredRules) {
      if (!categories.some((c) => c.id === r.categoryId)) orphans.push(r);
    }

    // Ordinamento regole interne
    const sortRules = (rs: Rule[]) => {
      const arr = [...rs];
      switch (sort) {
        case "alpha-asc":
          return arr.sort((a, b) => a.pattern.localeCompare(b.pattern));
        case "alpha-desc":
          return arr.sort((a, b) => b.pattern.localeCompare(a.pattern));
        case "match-desc":
          return arr.sort((a, b) => b.matchCount - a.matchCount);
        case "match-asc":
          return arr.sort((a, b) => a.matchCount - b.matchCount);
        case "recent":
          return arr.sort((a, b) => {
            const ta = a.lastMatchedAt?.getTime() ?? 0;
            const tb = b.lastMatchedAt?.getTime() ?? 0;
            return tb - ta;
          });
        case "rules-desc":
        default:
          return arr.sort((a, b) => b.matchCount - a.matchCount);
      }
    };

    for (const item of list) item.rules = sortRules(item.rules);

    // Ordinamento card
    switch (sort) {
      case "alpha-asc":
        list.sort((a, b) => a.category.name.localeCompare(b.category.name));
        break;
      case "alpha-desc":
        list.sort((a, b) => b.category.name.localeCompare(a.category.name));
        break;
      case "match-desc":
        list.sort(
          (a, b) =>
            b.rules.reduce((s, r) => s + r.matchCount, 0) -
            a.rules.reduce((s, r) => s + r.matchCount, 0),
        );
        break;
      case "match-asc":
        list.sort(
          (a, b) =>
            a.rules.reduce((s, r) => s + r.matchCount, 0) -
            b.rules.reduce((s, r) => s + r.matchCount, 0),
        );
        break;
      case "recent":
        list.sort((a, b) => {
          const ta = Math.max(...a.rules.map((r) => r.lastMatchedAt?.getTime() ?? 0));
          const tb = Math.max(...b.rules.map((r) => r.lastMatchedAt?.getTime() ?? 0));
          return tb - ta;
        });
        break;
      case "rules-desc":
      default:
        list.sort((a, b) => b.rules.length - a.rules.length);
    }

    return { list, orphans };
  }, [categories, byCategoryId, filteredRules, sort]);

  const totalRules = rules.length;
  const filteredCount = filteredRules.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca pattern o categoria…"
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
          label="Ordina"
          options={
            Object.entries(SORT_LABELS).map(([v, l]) => ({
              value: v as SortMode,
              label: l,
            })) as FilterOption<SortMode>[]
          }
          value={sort}
          onChange={setSort}
          overlayTitle="Ordina regole per"
        />

        <span className="text-xs text-muted-foreground ml-auto">
          {search ? (
            <>
              <span className="text-foreground font-medium">{filteredCount}</span>/{totalRules} regole in{" "}
              <span className="text-foreground font-medium">{cards.list.length}</span> categorie
            </>
          ) : (
            <>
              <span className="text-foreground font-medium">{totalRules}</span> regole in{" "}
              <span className="text-foreground font-medium">{cards.list.length}</span> categorie
            </>
          )}
        </span>
      </div>

      {cards.list.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          Nessuna regola di categorizzazione. Inizializza la tassonomia o creane una manualmente.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cards.list.map(({ category, rules: catRules }) => (
            <CategoryCard
              key={category.id}
              category={category}
              rules={catRules}
              allCategories={categories}
              defaultExpanded={!!search}
            />
          ))}
        </div>
      )}

      {cards.orphans.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-medium text-amber-900 mb-1">
            {cards.orphans.length} regole orfane (categoria eliminata)
          </div>
          <p className="text-xs text-amber-800">
            Queste regole puntano a categorie non più esistenti. Eliminale o ricreale.
          </p>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// CATEGORY CARD
// ===================================================================

function CategoryCard({
  category,
  rules,
  allCategories,
  defaultExpanded = false,
}: {
  category: Category;
  rules: Rule[];
  allCategories: Category[];
  defaultExpanded?: boolean;
}) {
  const [userToggled, setUserToggled] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Se l'utente non ha toccato lo state, "forziamo" expanded a defaultExpanded
  // (così quando arriva una search la card si apre, quando finisce torna chiusa).
  const isOpen = userToggled ? expanded : defaultExpanded;

  function toggle() {
    setUserToggled(true);
    setExpanded(!isOpen);
  }

  const totalMatches = rules.reduce((s, r) => s + r.matchCount, 0);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: category.color ?? "#a1a1aa" }}
          />
          <span className="font-medium text-sm truncate">{category.name}</span>
          <Badge tone={category.type === "income" ? "success" : "neutral"} className="text-[10px] shrink-0">
            {category.type === "income" ? "↑" : "↓"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Tag className="h-3 w-3" />
          <span>
            <span className="text-foreground font-medium">{rules.length}</span> regole
          </span>
          {totalMatches > 0 && (
            <span>
              · <span className="text-foreground font-medium">{totalMatches}</span> match
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {isOpen && (
        <ul className="divide-y divide-border border-t border-border">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              currentCategoryId={category.id}
              allCategories={allCategories}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ===================================================================
// RULE ROW
// ===================================================================

function RuleRow({
  rule,
  currentCategoryId,
  allCategories,
}: {
  rule: Rule;
  currentCategoryId: string;
  allCategories: Category[];
}) {
  const router = useRouter();
  const [moving, startMoveTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [showMove, setShowMove] = useState(false);

  function handleMove(newCategoryId: string) {
    if (newCategoryId === currentCategoryId) {
      setShowMove(false);
      return;
    }
    startMoveTransition(async () => {
      const res = await moveCategoryRuleAction({
        ruleId: rule.id,
        newCategoryId,
      });
      if (res.ok) {
        setShowMove(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Eliminare la regola "${rule.pattern}"?`)) return;
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.append("id", rule.id);
      await deleteCategoryRuleAction(fd);
      router.refresh();
    });
  }

  const busy = moving || deleting;

  return (
    <li className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-muted/20">
      <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground truncate max-w-xs">
        {rule.pattern}
      </code>
      <div className="flex items-center gap-2 text-muted-foreground">
        {rule.movementType && (
          <Badge tone={rule.movementType === "income" ? "success" : "neutral"} className="text-[10px]">
            {rule.movementType === "income" ? "↑" : "↓"}
          </Badge>
        )}
        <span>{rule.matchCount} match</span>
        {rule.lastMatchedAt && (
          <span>· {formatDate(rule.lastMatchedAt)}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 shrink-0">
        {showMove ? (
          <Select
            autoFocus
            value=""
            onChange={(e) => handleMove(e.target.value)}
            onBlur={() => setShowMove(false)}
            disabled={busy}
            className="h-7 text-xs w-44"
          >
            <option value="">Sposta in…</option>
            <optgroup label="Entrate">
              {allCategories
                .filter((c) => c.type === "income" && c.id !== currentCategoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Uscite">
              {allCategories
                .filter((c) => c.type === "expense" && c.id !== currentCategoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          </Select>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowMove(true)}
              disabled={busy}
              className="p-1 rounded text-muted-foreground hover:text-blue-700 hover:bg-blue-50"
              title="Sposta in altra categoria"
            >
              {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10"
              title="Elimina regola"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
