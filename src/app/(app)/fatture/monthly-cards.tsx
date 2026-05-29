import Link from "next/link";
import { ArrowUp, ArrowDown, FileText, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export type MonthlyInvoiceAggregate = {
  month: string;
  revenue: string;
  cost: string;
  receivable: string;
  count: number;
};

export function FattureMonthlyCards({
  data,
  extraQs,
}: {
  data: MonthlyInvoiceAggregate[];
  extraQs: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-12 text-center text-sm text-muted-foreground">
        Nessuna fattura per i filtri selezionati.
      </div>
    );
  }

  // Raggruppa per anno
  const byYear = new Map<number, MonthlyInvoiceAggregate[]>();
  for (const m of data) {
    const y = Number(m.month.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(m);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-6">
      {years.map((year) => {
        const months = byYear.get(year)!;
        const yearRevenue = months.reduce((s, m) => s + parseFloat(m.revenue), 0);
        const yearCost = months.reduce((s, m) => s + parseFloat(m.cost), 0);
        const yearReceivable = months.reduce(
          (s, m) => s + parseFloat(m.receivable),
          0,
        );
        return (
          <section key={year} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-sm font-medium">{year}</h3>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>
                  Vendite{" "}
                  <span className="text-success font-medium">
                    {formatCurrency(yearRevenue)}
                  </span>
                </span>
                <span>
                  Acquisti{" "}
                  <span className="text-danger font-medium">
                    {formatCurrency(yearCost)}
                  </span>
                </span>
                <span>
                  Margine{" "}
                  <span
                    className={`font-medium ${yearRevenue - yearCost >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {yearRevenue - yearCost >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(yearRevenue - yearCost))}
                  </span>
                </span>
                {yearReceivable > 0 && (
                  <span>
                    Da incassare{" "}
                    <span className="text-foreground font-medium">
                      {formatCurrency(yearReceivable)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {months.map((m) => (
                <FattureMonthCard key={m.month} data={m} extraQs={extraQs} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FattureMonthCard({
  data,
  extraQs,
}: {
  data: MonthlyInvoiceAggregate;
  extraQs: string;
}) {
  const [y, mm] = data.month.split("-").map(Number);
  const label = MONTH_LABELS[mm - 1];
  const revenue = parseFloat(data.revenue);
  const cost = parseFloat(data.cost);
  const receivable = parseFloat(data.receivable);
  const margin = revenue - cost;
  const href = `/fatture?period=month&month=${data.month}${extraQs ? `&${extraQs}` : ""}`;

  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-background p-3 hover:border-foreground/40 hover:bg-muted/30 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{y}</div>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums inline-flex items-center gap-0.5">
          <FileText className="h-2.5 w-2.5" />
          {data.count}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <ArrowUp className="h-3 w-3 text-success" />
            Vendite
          </span>
          <span className="text-success tabular-nums">{formatCurrency(revenue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <ArrowDown className="h-3 w-3 text-danger" />
            Acquisti
          </span>
          <span className="text-danger tabular-nums">{formatCurrency(cost)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 mt-1 border-t border-border">
          <span className="text-foreground">Margine</span>
          <span
            className={`font-medium tabular-nums ${margin >= 0 ? "text-success" : "text-danger"}`}
          >
            {margin >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(margin))}
          </span>
        </div>
        {receivable > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Da incassare
            </span>
            <span className="text-foreground tabular-nums">
              {formatCurrency(receivable)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
