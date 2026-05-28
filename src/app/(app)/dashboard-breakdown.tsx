"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export type CategoryItem = {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: number;
  count: number;
};

type MetricMode =
  | "income"
  | "expense"
  | "net"
  | "savingsRate"
  | "expenseRatio";

const METRIC_LABELS: Record<MetricMode, string> = {
  income: "Entrate del mese",
  expense: "Uscite del mese",
  net: "Saldo netto",
  savingsRate: "Tasso di risparmio (%)",
  expenseRatio: "Uscite / Entrate (%)",
};

export function DashboardBreakdown({
  income,
  expense,
  topExpenses,
  topIncomes,
}: {
  income: number;
  expense: number;
  topExpenses: CategoryItem[];
  topIncomes: CategoryItem[];
}) {
  const [metric, setMetric] = useState<MetricMode>("expense");

  const computed = computeMetric(metric, income, expense);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Card 1: KPI con dropdown */}
      <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Indicatore del mese</h3>
          <MetricDropdown value={metric} onChange={setMetric} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
          <div
            className={`text-4xl font-semibold tabular-nums ${
              computed.tone === "success"
                ? "text-success"
                : computed.tone === "danger"
                  ? "text-danger"
                  : "text-foreground"
            }`}
          >
            {computed.formatted}
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {computed.subtitle}
          </div>
        </div>

        {/* Mini stats footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
          <span>
            Entrate:{" "}
            <span className="text-success font-medium tabular-nums">
              {formatCurrency(income)}
            </span>
          </span>
          <span>
            Uscite:{" "}
            <span className="text-danger font-medium tabular-nums">
              {formatCurrency(expense)}
            </span>
          </span>
        </div>
      </div>

      {/* Card 2: top 5 categorie uscite */}
      <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Top categorie di spesa</h3>
          <span className="text-[10px] text-muted-foreground">Mese corrente</span>
        </div>
        <CategoryBars items={topExpenses} accent="danger" />
        {topIncomes.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Top categorie di entrata</h3>
            </div>
            <CategoryBars items={topIncomes} accent="success" />
          </>
        )}
      </div>
    </div>
  );
}

function computeMetric(
  mode: MetricMode,
  income: number,
  expense: number,
): { formatted: string; tone: "success" | "danger" | "neutral"; subtitle: string } {
  switch (mode) {
    case "income":
      return {
        formatted: formatCurrency(income),
        tone: "success",
        subtitle: "Totale incassato nel mese",
      };
    case "expense":
      return {
        formatted: formatCurrency(expense),
        tone: "danger",
        subtitle: "Totale speso nel mese",
      };
    case "net": {
      const net = income - expense;
      return {
        formatted: formatCurrency(net),
        tone: net >= 0 ? "success" : "danger",
        subtitle: net >= 0 ? "Hai chiuso in positivo" : "Hai chiuso in negativo",
      };
    }
    case "savingsRate": {
      if (income === 0)
        return {
          formatted: "—",
          tone: "neutral",
          subtitle: "Senza entrate non si può calcolare",
        };
      const rate = ((income - expense) / income) * 100;
      return {
        formatted: `${rate.toFixed(1)}%`,
        tone: rate >= 0 ? "success" : "danger",
        subtitle:
          rate >= 0
            ? `Trattieni il ${rate.toFixed(0)}% delle entrate`
            : "Stai spendendo più di quello che incassi",
      };
    }
    case "expenseRatio": {
      if (income === 0)
        return {
          formatted: "—",
          tone: "neutral",
          subtitle: "Senza entrate non si può calcolare",
        };
      const ratio = (expense / income) * 100;
      return {
        formatted: `${ratio.toFixed(1)}%`,
        tone: ratio > 100 ? "danger" : ratio > 80 ? "neutral" : "success",
        subtitle:
          ratio > 100
            ? "Spendi più di quanto incassi"
            : `Spendi il ${ratio.toFixed(0)}% delle entrate`,
      };
    }
  }
}

function MetricDropdown({
  value,
  onChange,
}: {
  value: MetricMode;
  onChange: (v: MetricMode) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MetricMode)}
        className="appearance-none h-7 pl-2.5 pr-7 rounded-md border border-input bg-background text-xs hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {Object.entries(METRIC_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function CategoryBars({
  items,
  accent,
}: {
  items: CategoryItem[];
  accent: "success" | "danger";
}) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        Nessun dato per questo mese.
      </div>
    );
  }
  const max = Math.max(...items.map((i) => i.total));
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it) => {
        const pct = max > 0 ? (it.total / max) * 100 : 0;
        return (
          <li key={it.categoryId ?? it.name} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: it.color ?? "#a1a1aa" }}
                />
                <span className="truncate">{it.name}</span>
              </span>
              <span
                className={`tabular-nums shrink-0 ml-2 ${accent === "success" ? "text-success" : "text-danger"}`}
              >
                {formatCurrency(it.total)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor:
                    accent === "success" ? "var(--success)" : "var(--danger)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
