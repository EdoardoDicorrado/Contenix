import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowLeftRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export type MonthlyAggregate = {
  month: string; // YYYY-MM
  income: string; // numeric come stringa da Drizzle
  expense: string;
  count: number;
  transferCount: number;
};

export function MonthlyCards({
  data,
  /** Querystring corrente (categoryIds, type, accountId, search) per preservarli nel link al mese */
  extraQs,
}: {
  data: MonthlyAggregate[];
  extraQs: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-12 text-center text-sm text-muted-foreground">
        Nessun movimento per i filtri selezionati.
      </div>
    );
  }

  // Raggruppa per anno (decrescente)
  const byYear = new Map<number, MonthlyAggregate[]>();
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
        const yearIncome = months.reduce((s, m) => s + parseFloat(m.income), 0);
        const yearExpense = months.reduce((s, m) => s + parseFloat(m.expense), 0);
        return (
          <section key={year} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-sm font-medium">{year}</h3>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>
                  <span className="text-success font-medium">
                    +{formatCurrency(yearIncome)}
                  </span>
                </span>
                <span>
                  <span className="text-danger font-medium">
                    −{formatCurrency(yearExpense)}
                  </span>
                </span>
                <span>
                  saldo{" "}
                  <span
                    className={`font-medium ${yearIncome - yearExpense >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {yearIncome - yearExpense >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(yearIncome - yearExpense))}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {months.map((m) => (
                <MonthCard key={m.month} data={m} extraQs={extraQs} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MonthCard({ data, extraQs }: { data: MonthlyAggregate; extraQs: string }) {
  const [y, mm] = data.month.split("-").map(Number);
  const label = MONTH_LABELS[mm - 1];
  const income = parseFloat(data.income);
  const expense = parseFloat(data.expense);
  const saldo = income - expense;
  const href = `/movimenti?period=month&month=${data.month}${extraQs ? `&${extraQs}` : ""}`;

  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-background p-3 hover:border-blue-400 hover:bg-muted/30 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{y}</div>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {data.count} mov.
          {data.transferCount > 0 && (
            <span className="inline-flex items-center gap-0.5 ml-1">
              <ArrowLeftRight className="h-2.5 w-2.5" />
              {data.transferCount}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <ArrowUp className="h-3 w-3 text-success" />
            Entrate
          </span>
          <span className="text-success tabular-nums">{formatCurrency(income)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <ArrowDown className="h-3 w-3 text-danger" />
            Uscite
          </span>
          <span className="text-danger tabular-nums">{formatCurrency(expense)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 mt-1 border-t border-border">
          <span className="text-foreground">Saldo</span>
          <span
            className={`font-medium tabular-nums ${saldo >= 0 ? "text-success" : "text-danger"}`}
          >
            {saldo >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(saldo))}
          </span>
        </div>
      </div>
    </Link>
  );
}
