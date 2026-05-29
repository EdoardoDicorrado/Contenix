"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

const MONTH_SHORT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

export type TrendPoint = {
  /** "YYYY-MM" per vista mensile, "YYYY" per vista annuale */
  month: string;
  income: number;
  expense: number;
  net: number;
  /** Solo per i punti forecast */
  forecastIncome?: number;
  forecastExpense?: number;
  forecastNet?: number;
  forecastNetLow?: number;
  forecastNetHigh?: number;
  isForecast?: boolean;
};

function formatMonthLabel(key: string): string {
  // Annuale: YYYY (4 char)
  if (/^\d{4}$/.test(key)) return key;
  // Mensile: YYYY-MM
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

function formatTickCurrency(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toFixed(0);
}

export type TrendScale = "month" | "year";

export function DashboardTrend({
  history,
  forecast,
  scale,
  title,
  subtitle,
}: {
  history: TrendPoint[];
  forecast: TrendPoint[];
  /** Tipo di asse temporale: "month" o "year". Default "month". */
  scale?: TrendScale;
  /** Titolo override. */
  title?: string;
  /** Sottotitolo override. */
  subtitle?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const currentScale: TrendScale = scale ?? "month";

  function setScale(s: TrendScale) {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    if (s === "year") params.set("scale", "year");
    else params.delete("scale");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  const data = useMemo(() => {
    const combined: TrendPoint[] = [
      ...history,
      ...forecast.map((f) => ({
        ...f,
        income: undefined as unknown as number,
        expense: undefined as unknown as number,
        net: undefined as unknown as number,
      })),
    ];
    return combined;
  }, [history, forecast]);

  // "Oggi" è il mese corrente (vista mensile) o l'anno corrente (vista annuale),
  // non l'ultimo punto della serie (che potrebbe essere dicembre).
  const todayMarker = useMemo(() => {
    const now = new Date();
    if (currentScale === "year") {
      return String(now.getFullYear());
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [currentScale]);
  // Mostra la reference line solo se il marker è effettivamente presente nella serie
  const hasTodayInData = useMemo(
    () => data.some((d) => d.month === todayMarker),
    [data, todayMarker],
  );

  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {title ?? (currentScale === "year" ? "Andamento annuale" : "Andamento mensile")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {subtitle ??
              (currentScale === "year"
                ? `${history.length} anni + previsione 3`
                : `${history.length} mesi + previsione 3`)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScaleDropdown value={currentScale} onChange={setScale} open={open} setOpen={setOpen} />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <LegendDot color="var(--success)" label="Entrate" />
            <LegendDot color="var(--danger)" label="Uscite" />
            <LegendDot color="var(--foreground)" label="Saldo" />
          </div>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              tickFormatter={formatTickCurrency}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.3 }}
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "11px",
              }}
              labelFormatter={(label) => formatMonthLabel(String(label))}
              formatter={(value, name) => {
                if (value == null) return ["—", name];
                const num = typeof value === "number" ? value : parseFloat(String(value));
                if (isNaN(num)) return ["—", name];
                return [formatCurrency(num), name];
              }}
            />
            {hasTodayInData && (
              <ReferenceLine
                x={todayMarker}
                stroke="var(--border)"
                strokeDasharray="4 4"
                label={{
                  value: "Oggi",
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
            )}
            <ReferenceLine y={0} stroke="var(--border)" />

            <Bar dataKey="income" name="Entrate" fill="var(--success)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expense" name="Uscite" fill="var(--danger)" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="net"
              name="Saldo"
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--foreground)" }}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />

            {/* Forecast (linea tratteggiata) */}
            <Area
              type="monotone"
              dataKey="forecastNetHigh"
              name="—"
              stroke="none"
              fill="var(--foreground)"
              fillOpacity={0.08}
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="forecastNetLow"
              name="—"
              stroke="none"
              fill="var(--background)"
              fillOpacity={1}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="forecastNet"
              name="Previsione saldo"
              stroke="var(--foreground)"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--foreground)" }}
              connectNulls={false}
            />
            <Bar
              dataKey="forecastIncome"
              name="Previsione entrate"
              fill="var(--success)"
              fillOpacity={0.35}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="forecastExpense"
              name="Previsione uscite"
              fill="var(--danger)"
              fillOpacity={0.35}
              radius={[2, 2, 0, 0]}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} verticalAlign="bottom" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Previsione basata sugli ultimi 6 mesi (trend lineare). È una stima
        approssimativa, non un modello predittivo.
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ScaleDropdown({
  value,
  onChange,
  open,
  setOpen,
}: {
  value: TrendScale;
  onChange: (s: TrendScale) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const options: Array<{ v: TrendScale; label: string }> = [
    { v: "month", label: "Mensile" },
    { v: "year", label: "Annuale" },
  ];
  const current = options.find((o) => o.v === value)?.label ?? "Mensile";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-7 inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted"
      >
        Vista: <span className="font-medium">{current}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-40 right-0 mt-1 w-32 rounded-md border border-border bg-background shadow-lg p-1">
            {options.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => {
                  onChange(o.v);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-2.5 py-1 rounded text-sm text-left transition-colors",
                  value === o.v
                    ? "bg-foreground text-background font-medium"
                    : "hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
