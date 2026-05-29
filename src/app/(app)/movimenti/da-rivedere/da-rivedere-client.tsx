"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Sparkles,
  CheckCircle2,
  Loader2,
  ArrowDown,
  ArrowUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  bulkCategorizeAction,
  createRuleAndApplyAction,
} from "./actions";
import type { Cluster, UnmatchedRow } from "./page";

type Category = CategoryOption;

export function DaRivedereClient({
  clusters,
  singletons,
  categories: initialCategories,
}: {
  clusters: Cluster[];
  singletons: UnmatchedRow[];
  categories: Category[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);

  function handleCategoryCreated(cat: Category) {
    setCategories((prev) =>
      prev.some((c) => c.id === cat.id) ? prev : [...prev, cat],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {clusters.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Gruppi ricorrenti ({clusters.length})
          </h3>
          {clusters.map((c) => (
            <ClusterCard
              key={c.pattern}
              cluster={c}
              categories={categories}
              onCategoryCreated={handleCategoryCreated}
            />
          ))}
        </section>
      )}

      {singletons.length > 0 && (
        <section className="flex flex-col gap-3 mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Movimenti singoli ({singletons.length})
          </h3>
          <SingletonsList
            rows={singletons}
            categories={categories}
            onCategoryCreated={handleCategoryCreated}
          />
        </section>
      )}
    </div>
  );
}

// ===================================================================
// CLUSTER (gruppo ricorrente)
// ===================================================================

function ClusterCard({
  cluster,
  categories,
  onCategoryCreated,
}: {
  cluster: Cluster;
  categories: Category[];
  onCategoryCreated: (cat: Category) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [savePattern, setSavePattern] = useState(true);
  const [patternText, setPatternText] = useState(cluster.pattern);
  const [showAll, setShowAll] = useState(false);
  const [showPatternEdit, setShowPatternEdit] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = cluster.rows.map((r) => r.id);
  const incomeTotal = cluster.rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expenseTotal = cluster.rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  function handleApply() {
    if (!categoryId) return;
    setError(null);
    startTransition(async () => {
      const res = savePattern
        ? await createRuleAndApplyAction({
            pattern: patternText.trim(),
            categoryId: categoryId,
            movementType: cluster.type === "mixed" ? null : cluster.type,
            movementIds: ids,
          })
        : await bulkCategorizeAction({ movementIds: ids, categoryId: categoryId });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("ruleCreated" in res) {
        setResult(`Categorizzati ${res.updated} movimenti${res.ruleCreated ? " + regola creata" : ""}`);
      } else {
        setResult(`Categorizzati ${res.updated} movimenti`);
      }
      router.refresh();
    });
  }

  const visibleRows = showAll ? cluster.rows : cluster.rows.slice(0, 3);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{cluster.pattern}</code>
          <Badge tone="neutral" className="text-[10px]">
            {cluster.rows.length} movimenti
          </Badge>
          {cluster.type === "income" && (
            <Badge tone="success" className="text-[10px] gap-1">
              <ArrowUp className="h-3 w-3" />
              Entrate {formatCurrency(incomeTotal)}
            </Badge>
          )}
          {cluster.type === "expense" && (
            <Badge tone="neutral" className="text-[10px] gap-1">
              <ArrowDown className="h-3 w-3" />
              Uscite {formatCurrency(expenseTotal)}
            </Badge>
          )}
          {cluster.type === "mixed" && (
            <Badge tone="neutral" className="text-[10px]">
              Misto: +{formatCurrency(incomeTotal)} −{formatCurrency(expenseTotal)}
            </Badge>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border">
        {visibleRows.map((r) => (
          <ExpandableRow key={r.id} row={r} />
        ))}
      </ul>
      {cluster.rows.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full text-xs text-blue-700 hover:underline py-2 border-t border-border bg-muted/30"
        >
          {showAll ? "Mostra solo i primi 3" : `Vedi altri ${cluster.rows.length - 3}`}
        </button>
      )}

      <div className="border-t border-border bg-muted/30 p-3 flex flex-col gap-2.5">
        {result ? (
          <div className="flex items-center gap-2 text-sm text-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            {result}
          </div>
        ) : (
          <>
            <CategoryCombo
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              filterType={cluster.type === "mixed" ? undefined : cluster.type}
              onCategoryCreated={onCategoryCreated}
              placeholder="Categoria…"
            />

            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savePattern}
                  onChange={(e) => setSavePattern(e.target.checked)}
                />
                <span>Salva regola</span>
                <code className="font-mono text-muted-foreground">&quot;{patternText}&quot;</code>
                {savePattern && (
                  <button
                    type="button"
                    onClick={() => setShowPatternEdit(!showPatternEdit)}
                    className="text-blue-700 hover:underline"
                  >
                    {showPatternEdit ? "ok" : "modifica"}
                  </button>
                )}
              </label>
            </div>

            {showPatternEdit && savePattern && (
              <input
                type="text"
                value={patternText}
                onChange={(e) => setPatternText(e.target.value)}
                disabled={pending}
                className="h-8 text-xs border border-input rounded px-2 bg-background font-mono"
                placeholder="pattern…"
              />
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-900">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleApply}
                disabled={!categoryId || pending}
                size="sm"
                className="gap-2"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : savePattern ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {savePattern ? "Crea regola e applica" : "Categorizza tutto"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExpandableRow({ row }: { row: UnmatchedRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="px-4 py-2 text-xs flex items-start gap-3 cursor-pointer hover:bg-muted/30"
      onClick={() => setOpen(!open)}
      title={open ? "Comprimi" : "Espandi descrizione completa"}
    >
      <span className="text-muted-foreground tabular-nums w-20 shrink-0">
        {formatDate(new Date(row.date))}
      </span>
      <span className={`flex-1 ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}>
        {row.description}
      </span>
      <span
        className={`tabular-nums shrink-0 ${
          row.type === "income" ? "text-success" : "text-danger"
        }`}
      >
        {row.type === "income" ? "+" : "−"}
        {formatCurrency(row.amount)}
      </span>
    </li>
  );
}

// ===================================================================
// SINGLETONS LIST (movimenti singoli)
// ===================================================================

function SingletonsList({
  rows,
  categories,
  onCategoryCreated,
}: {
  rows: UnmatchedRow[];
  categories: Category[];
  onCategoryCreated: (cat: Category) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-20">Data</th>
            <th className="text-left px-3 py-2 font-medium">Descrizione</th>
            <th className="text-right px-3 py-2 font-medium w-24">Importo</th>
            <th className="text-left px-3 py-2 font-medium w-72">Categoria</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <SingletonRow
              key={r.id}
              row={r}
              categories={categories}
              onCategoryCreated={onCategoryCreated}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SingletonRow({
  row,
  categories,
  onCategoryCreated,
}: {
  row: UnmatchedRow;
  categories: Category[];
  onCategoryCreated: (cat: Category) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleAssign(catId: string | null) {
    setCategoryId(catId);
    if (!catId) return;
    startTransition(async () => {
      const res = await bulkCategorizeAction({
        movementIds: [row.id],
        categoryId: catId,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <tr className={`hover:bg-muted/30 ${done ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
        {formatDate(new Date(row.date))}
      </td>
      <td
        className={`px-3 py-2 text-xs max-w-md cursor-pointer ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
        onClick={() => setExpanded(!expanded)}
        title={expanded ? "Comprimi" : "Click per leggere tutto"}
      >
        {row.description}
      </td>
      <td
        className={`px-3 py-2 text-xs text-right tabular-nums ${
          row.type === "income" ? "text-success" : "text-danger"
        }`}
      >
        {row.type === "income" ? "+" : "−"}
        {formatCurrency(row.amount)}
      </td>
      <td className="px-3 py-2">
        {done ? (
          <span className="text-xs text-success inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Categorizzato
          </span>
        ) : (
          <div className="inline-flex items-center gap-2 min-w-0">
            <CategoryCombo
              categories={categories}
              value={categoryId}
              onChange={handleAssign}
              filterType={row.type}
              onCategoryCreated={onCategoryCreated}
              placeholder="Categoria…"
            />
            {pending && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0"
                aria-label="Salvataggio in corso"
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
