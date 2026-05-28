import {
  getAccountsBalances,
  getEmployeeSummary,
  getInvoiceSummary,
  getKpiOverview,
  getMonthlyTimeseries,
  getTopCategoriesInWindow,
  getTopVendorsInWindow,
  getYearlyTimeseries,
} from "@/lib/db/queries/dashboard";
import { forecastTimeseries } from "@/lib/forecast";
import {
  describePeriod,
  periodFromSearchParams,
  periodToWindow,
} from "@/lib/period";
import { DashboardKpi } from "./dashboard-kpi";
import { DashboardTrend, type TrendPoint } from "./dashboard-trend";
import { DashboardBreakdown } from "./dashboard-breakdown";
import { DashboardSecondary } from "./dashboard-secondary";
import { DashboardPeriodBar } from "./dashboard-period-bar";

type SP = Promise<{
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  year?: string;
  quarter?: string;
  scale?: string;
}>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const rawPeriod = periodFromSearchParams(sp);
  // Default dashboard: anno corrente intero (full-year).
  const currentYear = new Date().getUTCFullYear();
  const period: typeof rawPeriod =
    rawPeriod.kind === "all" ? { kind: "full-year", year: currentYear } : rawPeriod;
  const window = periodToWindow(period);
  const periodLabel = describePeriod(period);

  const scale: "month" | "year" = sp.scale === "year" ? "year" : "month";

  const [
    kpi,
    monthlySeries,
    yearlySeries,
    topExpenses,
    topIncomes,
    accounts,
    invoiceSummary,
    employeeSummary,
    topVendors,
  ] = await Promise.all([
    getKpiOverview(window),
    // Default vista mensile: anno corrente (gen-dic). Sempre caricato per
    // mantenere il forecast disponibile.
    getMonthlyTimeseries({ mode: "calendar-year", year: currentYear }),
    scale === "year"
      ? getYearlyTimeseries(5)
      : Promise.resolve([] as Awaited<ReturnType<typeof getYearlyTimeseries>>),
    getTopCategoriesInWindow(window, "expense", 5),
    getTopCategoriesInWindow(window, "income", 5),
    getAccountsBalances(),
    getInvoiceSummary(),
    getEmployeeSummary(),
    getTopVendorsInWindow(window, 5),
  ]);

  // Forecast 3 punti (mesi o anni) basato sulla serie corrente
  const baseSeries =
    scale === "year"
      ? yearlySeries.map((y) => ({
          month: String(y.year),
          income: y.income,
          expense: y.expense,
          net: y.net,
        }))
      : monthlySeries;

  const incomeF = forecastTimeseries(baseSeries.map((p) => p.income), 3);
  const expenseF = forecastTimeseries(baseSeries.map((p) => p.expense), 3);
  const netF = forecastTimeseries(baseSeries.map((p) => p.net), 3);

  const lastKey = baseSeries[baseSeries.length - 1]?.month ?? "";
  const forecastPoints: TrendPoint[] = incomeF.map((_, i) => {
    let futureKey: string;
    if (scale === "year") {
      const lastY = Number(lastKey || currentYear);
      futureKey = String(lastY + (i + 1));
    } else {
      const [y, m] = lastKey.split("-").map(Number);
      const futureDate = new Date(Date.UTC(y, m - 1 + (i + 1), 1));
      futureKey = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return {
      month: futureKey,
      income: 0,
      expense: 0,
      net: 0,
      forecastIncome: incomeF[i].value,
      forecastExpense: expenseF[i].value,
      forecastNet: netF[i].value,
      forecastNetLow: netF[i].low,
      forecastNetHigh: netF[i].high,
      isForecast: true,
    };
  });

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Panoramica finanziaria · {periodLabel}
          </p>
        </div>
        <DashboardPeriodBar initialPeriod={rawPeriod} />
      </div>

      <DashboardKpi data={kpi} periodLabel={periodLabel} />

      <DashboardTrend
        history={baseSeries}
        forecast={forecastPoints}
        scale={scale}
      />

      <DashboardBreakdown
        income={kpi.current.income}
        expense={kpi.current.expense}
        topExpenses={topExpenses}
        topIncomes={topIncomes}
        periodLabel={periodLabel}
      />

      <DashboardSecondary
        accounts={accounts}
        invoices={invoiceSummary.topPending}
        invoiceCounts={{
          paid: invoiceSummary.paid,
          pending: invoiceSummary.pending,
          overdue: invoiceSummary.overdue,
        }}
        employees={employeeSummary}
        topVendors={topVendors}
        periodLabel={periodLabel}
      />
    </div>
  );
}
