import {
  getAccountsBalances,
  getEmployeeSummary,
  getInvoiceSummary,
  getKpiOverview,
  getMonthlyTimeseries,
  getTopCategoriesInWindow,
  getTopVendorsInWindow,
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
}>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const period = periodFromSearchParams(sp);
  // Se "all", uso il mese corrente come finestra per KPI/top (per dare sempre dati utili)
  const window =
    period.kind === "all"
      ? (() => {
          const now = new Date();
          return {
            from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
            to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
          };
        })()
      : periodToWindow(period);
  const periodLabel = period.kind === "all" ? "Mese corrente" : describePeriod(period);

  const [
    kpi,
    timeseries,
    topExpenses,
    topIncomes,
    accounts,
    invoiceSummary,
    employeeSummary,
    topVendors,
  ] = await Promise.all([
    getKpiOverview(window),
    getMonthlyTimeseries(12),
    getTopCategoriesInWindow(window, "expense", 5),
    getTopCategoriesInWindow(window, "income", 5),
    getAccountsBalances(),
    getInvoiceSummary(),
    getEmployeeSummary(),
    getTopVendorsInWindow(window, 5),
  ]);

  // Forecast 3 mesi avanti
  const incomeF = forecastTimeseries(timeseries.map((p) => p.income), 3);
  const expenseF = forecastTimeseries(timeseries.map((p) => p.expense), 3);
  const netF = forecastTimeseries(timeseries.map((p) => p.net), 3);

  const forecastPoints: TrendPoint[] = incomeF.map((_, i) => {
    const lastMonth = timeseries[timeseries.length - 1].month;
    const [y, m] = lastMonth.split("-").map(Number);
    const futureDate = new Date(Date.UTC(y, m - 1 + (i + 1), 1));
    const futureKey = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}`;
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
        <DashboardPeriodBar initialPeriod={period} />
      </div>

      <DashboardKpi data={kpi} periodLabel={periodLabel} />

      <DashboardTrend
        history={timeseries.map((p) => ({
          month: p.month,
          income: p.income,
          expense: p.expense,
          net: p.net,
        }))}
        forecast={forecastPoints}
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
