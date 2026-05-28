import {
  getAccountsBalances,
  getEmployeeSummary,
  getInvoiceSummary,
  getKpiOverview,
  getMonthlyTimeseries,
  getTopCategoriesForMonth,
  getTopVendorsForMonth,
} from "@/lib/db/queries/dashboard";
import { forecastTimeseries } from "@/lib/forecast";
import { DashboardKpi } from "./dashboard-kpi";
import { DashboardTrend, type TrendPoint } from "./dashboard-trend";
import { DashboardBreakdown } from "./dashboard-breakdown";
import { DashboardSecondary } from "./dashboard-secondary";

const MONTH_LABEL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

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
    getKpiOverview(),
    getMonthlyTimeseries(12),
    getTopCategoriesForMonth(year, month, "expense", 5),
    getTopCategoriesForMonth(year, month, "income", 5),
    getAccountsBalances(),
    getInvoiceSummary(),
    getEmployeeSummary(),
    getTopVendorsForMonth(year, month, 5),
  ]);

  // Forecast 3 mesi avanti per ogni serie
  const incomeHistory = timeseries.map((p) => p.income);
  const expenseHistory = timeseries.map((p) => p.expense);
  const netHistory = timeseries.map((p) => p.net);
  const incomeF = forecastTimeseries(incomeHistory, 3);
  const expenseF = forecastTimeseries(expenseHistory, 3);
  const netF = forecastTimeseries(netHistory, 3);

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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {MONTH_LABEL[month - 1]} {year} · panoramica finanziaria
        </p>
      </div>

      {/* Sezione 1: KPI */}
      <DashboardKpi data={kpi} />

      {/* Sezione 2: andamento + forecast */}
      <DashboardTrend
        history={timeseries.map((p) => ({
          month: p.month,
          income: p.income,
          expense: p.expense,
          net: p.net,
        }))}
        forecast={forecastPoints}
      />

      {/* Sezione 3: indicatore + top categorie */}
      <DashboardBreakdown
        income={kpi.current.income}
        expense={kpi.current.expense}
        topExpenses={topExpenses.map((c) => ({
          categoryId: c.categoryId,
          name: c.name,
          color: c.color,
          total: c.total,
          count: c.count,
        }))}
        topIncomes={topIncomes.map((c) => ({
          categoryId: c.categoryId,
          name: c.name,
          color: c.color,
          total: c.total,
          count: c.count,
        }))}
      />

      {/* Sezione 4: secondari */}
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
      />
    </div>
  );
}
