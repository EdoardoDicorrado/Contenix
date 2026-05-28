import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Equal,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { percentDelta } from "@/lib/forecast";

export type KpiData = {
  totalBalance: number;
  current: { income: number; expense: number; net: number };
  previous: { income: number; expense: number; net: number };
};

/**
 * Riga di 4 KPI card con delta MoM (Month over Month).
 */
export function DashboardKpi({ data }: { data: KpiData }) {
  const incomeDelta = percentDelta(data.current.income, data.previous.income);
  const expenseDelta = percentDelta(data.current.expense, data.previous.expense);
  const netDelta = percentDelta(data.current.net, data.previous.net);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Saldo totale"
        value={formatCurrency(data.totalBalance)}
        icon={<Wallet className="h-4 w-4" />}
        accent={data.totalBalance >= 0 ? "success" : "danger"}
        subtitle="Somma di tutti i conti"
      />
      <KpiCard
        label="Entrate del mese"
        value={formatCurrency(data.current.income)}
        icon={<TrendingUp className="h-4 w-4" />}
        accent="success"
        delta={incomeDelta}
        deltaIsGood="up"
      />
      <KpiCard
        label="Uscite del mese"
        value={formatCurrency(data.current.expense)}
        icon={<TrendingDown className="h-4 w-4" />}
        accent="danger"
        delta={expenseDelta}
        deltaIsGood="down"
      />
      <KpiCard
        label="Saldo netto del mese"
        value={formatCurrency(data.current.net)}
        icon={
          data.current.net >= 0 ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        }
        accent={data.current.net >= 0 ? "success" : "danger"}
        delta={netDelta}
        deltaIsGood="up"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  delta,
  deltaIsGood,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "success" | "danger" | "neutral";
  delta?: number | null;
  /** "up" significa "salire è buono", "down" significa "scendere è buono" */
  deltaIsGood?: "up" | "down";
  subtitle?: string;
}) {
  const iconColor = {
    success: "text-success",
    danger: "text-danger",
    neutral: "text-muted-foreground",
  }[accent];

  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${iconColor}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground min-h-[14px]">
        {delta != null && deltaIsGood ? (
          <DeltaBadge value={delta} isGoodDir={deltaIsGood} />
        ) : subtitle ? (
          subtitle
        ) : delta === null ? (
          "—"
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

function DeltaBadge({
  value,
  isGoodDir,
}: {
  value: number;
  isGoodDir: "up" | "down";
}) {
  const isUp = value > 0;
  const isDown = value < 0;
  const isFlat = value === 0;
  const isGood =
    (isUp && isGoodDir === "up") || (isDown && isGoodDir === "down") || isFlat;
  const color = isFlat
    ? "text-muted-foreground"
    : isGood
      ? "text-success"
      : "text-danger";
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Equal;
  return (
    <span className={`inline-flex items-center gap-0.5 ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}% vs mese scorso
    </span>
  );
}
