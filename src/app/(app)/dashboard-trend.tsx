"use client";

import { useMemo } from "react";
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
import { formatCurrency } from "@/lib/utils";

const MONTH_SHORT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

export type TrendPoint = {
  month: string; // YYYY-MM
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

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

function formatTickCurrency(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toFixed(0);
}

export function DashboardTrend({
  history,
  forecast,
}: {
  history: TrendPoint[];
  forecast: TrendPoint[];
}) {
  const data = useMemo(() => {
    // Combina storico + forecast in unica serie. Per i punti forecast, i valori
    // "storici" sono undefined così la linea storica si interrompe.
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

  const lastHistoryIdx = history.length - 1;
  const lastHistoryMonth = history[lastHistoryIdx]?.month;

  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Andamento mensile</h3>
          <p className="text-[11px] text-muted-foreground">
            Ultimi {history.length} mesi + previsione 3 mesi
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <LegendDot color="var(--success)" label="Entrate" />
          <LegendDot color="var(--danger)" label="Uscite" />
          <LegendDot color="#3b82f6" label="Saldo netto" />
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
            {lastHistoryMonth && (
              <ReferenceLine
                x={lastHistoryMonth}
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
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#3b82f6" }}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />

            {/* Forecast (linea tratteggiata) */}
            <Area
              type="monotone"
              dataKey="forecastNetHigh"
              name="—"
              stroke="none"
              fill="#3b82f6"
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
              stroke="#3b82f6"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#3b82f6" }}
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
