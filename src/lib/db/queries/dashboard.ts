import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  employees,
  financialAccounts,
  invoices,
  movements,
} from "@/lib/db/schema";
import { fingerprint } from "@/lib/text-fingerprint";

export type MonthlyDataPoint = {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  net: number;
};

/**
 * Serie temporale mensile per il grafico.
 * - `mode: "calendar-year"` (default): tutti i 12 mesi dell'anno (gen-dic).
 * - `mode: "rolling"`: gli ultimi N mesi rolling fino a oggi.
 */
export async function getMonthlyTimeseries(
  options: { mode?: "calendar-year" | "rolling"; year?: number; months?: number } = {},
): Promise<MonthlyDataPoint[]> {
  const mode = options.mode ?? "calendar-year";
  const now = new Date();
  let startYear: number;
  let startMonth: number;
  let numPoints: number;

  if (mode === "calendar-year") {
    const y = options.year ?? now.getUTCFullYear();
    startYear = y;
    startMonth = 0;
    numPoints = 12;
  } else {
    const months = options.months ?? 12;
    startYear = now.getUTCFullYear();
    startMonth = now.getUTCMonth() - (months - 1);
    numPoints = months;
  }

  const start = new Date(Date.UTC(startYear, startMonth, 1));
  const end = new Date(Date.UTC(startYear, startMonth + numPoints, 1));

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${movements.date}), 'YYYY-MM')`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' AND ${movements.isTransfer} = false THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' AND ${movements.isTransfer} = false THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
    })
    .from(movements)
    .where(and(gte(movements.date, start), lt(movements.date, end)))
    .groupBy(sql`date_trunc('month', ${movements.date})`);

  const byMonth = new Map(rows.map((r) => [r.month, r]));

  const out: MonthlyDataPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const d = new Date(Date.UTC(startYear, startMonth + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key);
    const income = row ? parseFloat(row.income) : 0;
    const expense = row ? parseFloat(row.expense) : 0;
    out.push({
      month: key,
      income,
      expense,
      net: income - expense,
    });
  }
  return out;
}

/**
 * Serie temporale annuale: un punto per anno solare (ultimi N anni).
 * Esclude trasferimenti.
 */
export type YearlyDataPoint = {
  year: number;
  income: number;
  expense: number;
  net: number;
};

export async function getYearlyTimeseries(years = 5): Promise<YearlyDataPoint[]> {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - (years - 1);
  const start = new Date(Date.UTC(startYear, 0, 1));
  const end = new Date(Date.UTC(endYear + 1, 0, 1));

  const rows = await db
    .select({
      y: sql<string>`to_char(date_trunc('year', ${movements.date}), 'YYYY')`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' AND ${movements.isTransfer} = false THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' AND ${movements.isTransfer} = false THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
    })
    .from(movements)
    .where(and(gte(movements.date, start), lt(movements.date, end)))
    .groupBy(sql`date_trunc('year', ${movements.date})`);

  const byYear = new Map(rows.map((r) => [r.y, r]));
  const out: YearlyDataPoint[] = [];
  for (let i = 0; i < years; i++) {
    const y = startYear + i;
    const row = byYear.get(String(y));
    const income = row ? parseFloat(row.income) : 0;
    const expense = row ? parseFloat(row.expense) : 0;
    out.push({ year: y, income, expense, net: income - expense });
  }
  return out;
}

/**
 * KPI del mese corrente + mese precedente, per calcolare i delta MoM.
 */
export type KpiOverview = {
  current: {
    income: number;
    expense: number;
    net: number;
    count: number;
  };
  previous: {
    income: number;
    expense: number;
    net: number;
  };
  totalBalance: number; // saldo totale di tutti i conti
};

/**
 * KPI per la finestra selezionata + finestra equivalente immediatamente
 * precedente (per calcolare i delta). Default: mese corrente vs mese precedente.
 */
export async function getKpiOverview(window: { from?: Date; to?: Date } = {}): Promise<KpiOverview> {
  const now = new Date();
  let curStart: Date;
  let curEnd: Date;
  if (window.from && window.to) {
    curStart = window.from;
    curEnd = window.to;
  } else {
    curStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    curEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  // Finestra precedente equivalente: stesso ampiezza, immediatamente prima
  const lenMs = curEnd.getTime() - curStart.getTime();
  const prevStart = new Date(curStart.getTime() - lenMs);
  const prevEnd = curStart;

  const [curRow, prevRow, balanceRow] = await Promise.all([
    db
      .select({
        income: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
        expense: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(movements)
      .where(
        and(
          gte(movements.date, curStart),
          lt(movements.date, curEnd),
          eq(movements.isTransfer, false),
        ),
      ),
    db
      .select({
        income: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'income' THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
        expense: sql<string>`COALESCE(SUM(CASE WHEN ${movements.type} = 'expense' THEN ${movements.amount}::numeric ELSE 0 END), 0)::text`,
      })
      .from(movements)
      .where(
        and(
          gte(movements.date, prevStart),
          lt(movements.date, prevEnd),
          eq(movements.isTransfer, false),
        ),
      ),
    db
      .select({
        balance: sql<string>`(COALESCE(SUM(
          "financial_accounts"."opening_balance"::numeric +
          COALESCE((
            SELECT SUM(CASE WHEN "movements"."type" = 'income' THEN "movements"."amount"::numeric ELSE -"movements"."amount"::numeric END)
            FROM "movements"
            WHERE "movements"."account_id" = "financial_accounts"."id"
          ), 0)
        ), 0))::text`,
      })
      .from(financialAccounts),
  ]);

  const curIncome = parseFloat(curRow[0]?.income ?? "0");
  const curExpense = parseFloat(curRow[0]?.expense ?? "0");
  const prevIncome = parseFloat(prevRow[0]?.income ?? "0");
  const prevExpense = parseFloat(prevRow[0]?.expense ?? "0");

  return {
    current: {
      income: curIncome,
      expense: curExpense,
      net: curIncome - curExpense,
      count: curRow[0]?.count ?? 0,
    },
    previous: {
      income: prevIncome,
      expense: prevExpense,
      net: prevIncome - prevExpense,
    },
    totalBalance: parseFloat(balanceRow[0]?.balance ?? "0"),
  };
}

/**
 * Top N categorie del mese per importo (in valore assoluto).
 * `type` filtra entrate o uscite. Esclude i trasferimenti.
 */
export type TopCategory = {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: number;
  count: number;
};

export async function getTopCategoriesInWindow(
  window: { from?: Date; to?: Date },
  type: "income" | "expense",
  limit = 5,
): Promise<TopCategory[]> {
  const now = new Date();
  const start =
    window.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end =
    window.to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rows = await db
    .select({
      categoryId: movements.categoryId,
      name: categories.name,
      color: categories.color,
      total: sql<string>`SUM(${movements.amount}::numeric)::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(movements)
    .leftJoin(categories, eq(movements.categoryId, categories.id))
    .where(
      and(
        gte(movements.date, start),
        lt(movements.date, end),
        eq(movements.type, type),
        eq(movements.isTransfer, false),
      ),
    )
    .groupBy(movements.categoryId, categories.name, categories.color)
    .orderBy(sql`SUM(${movements.amount}::numeric) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? "Senza categoria",
    color: r.color,
    total: parseFloat(r.total),
    count: r.count,
  }));
}

/**
 * Top N "vendor" del mese aggregando per descrizione normalizzata.
 * Euristica semplice: usa i primi 2 token significativi della descrizione.
 */
export type TopVendor = {
  pattern: string;
  total: number;
  count: number;
};

export async function getTopVendorsInWindow(
  window: { from?: Date; to?: Date },
  limit = 5,
): Promise<TopVendor[]> {
  const now = new Date();
  const start =
    window.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end =
    window.to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rows = await db
    .select({
      description: movements.description,
      amount: movements.amount,
    })
    .from(movements)
    .where(
      and(
        gte(movements.date, start),
        lt(movements.date, end),
        eq(movements.type, "expense"),
        eq(movements.isTransfer, false),
      ),
    );

  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const fp = fingerprint(r.description);
    if (!fp) continue;
    const cur = map.get(fp) ?? { total: 0, count: 0 };
    cur.total += parseFloat(r.amount);
    cur.count += 1;
    map.set(fp, cur);
  }

  return Array.from(map.entries())
    .map(([pattern, v]) => ({ pattern, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Riepilogo fatture: pagate/in attesa/scadute + top 3 in attesa per importo.
 */
export type InvoiceSummary = {
  paid: number;
  pending: number;
  overdue: number;
  topPending: Array<{
    id: string;
    counterpartyName: string;
    totalAmount: number;
    dueDate: Date | null;
    type: "sale" | "purchase";
  }>;
};

export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  const [counts, top] = await Promise.all([
    db
      .select({
        status: invoices.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(invoices)
      .groupBy(invoices.status),
    db
      .select({
        id: invoices.id,
        counterpartyName: invoices.counterpartyName,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        type: invoices.type,
      })
      .from(invoices)
      .where(sql`${invoices.status} IN ('pending', 'partial', 'overdue')`)
      .orderBy(desc(invoices.totalAmount))
      .limit(3),
  ]);

  const map = new Map(counts.map((c) => [c.status, c.count]));
  return {
    paid: map.get("paid") ?? 0,
    pending: (map.get("pending") ?? 0) + (map.get("partial") ?? 0),
    overdue: map.get("overdue") ?? 0,
    topPending: top.map((t) => ({
      id: t.id,
      counterpartyName: t.counterpartyName,
      totalAmount: parseFloat(t.totalAmount),
      dueDate: t.dueDate,
      type: t.type,
    })),
  };
}

/**
 * Riepilogo dipendenti: count attivi, costo mensile aggregato, ricavi portati.
 */
export type EmployeeSummary = {
  activeCount: number;
  totalCount: number;
  monthlyCost: number;
  // ricavi attribuiti ai dipendenti (employee_id != null, type=income, NOT transfer)
  totalRevenue: number;
};

export async function getEmployeeSummary(): Promise<EmployeeSummary> {
  const [counts, cost, revenue] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${employees.active} = true)::int`,
      })
      .from(employees),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${employees.monthlyCost}::numeric), 0)::text`,
      })
      .from(employees)
      .where(eq(employees.active, true)),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${movements.amount}::numeric), 0)::text`,
      })
      .from(movements)
      .where(
        and(
          eq(movements.type, "income"),
          eq(movements.isTransfer, false),
          sql`${movements.employeeId} IS NOT NULL`,
        ),
      ),
  ]);

  return {
    activeCount: counts[0]?.active ?? 0,
    totalCount: counts[0]?.total ?? 0,
    monthlyCost: parseFloat(cost[0]?.total ?? "0"),
    totalRevenue: parseFloat(revenue[0]?.total ?? "0"),
  };
}

/**
 * Saldi correnti di tutti i conti (per la card "Saldi per conto").
 */
export type AccountBalance = {
  id: string;
  name: string;
  type: string;
  color: string | null;
  balance: number;
  isPrimary: boolean;
};

export async function getAccountsBalances(): Promise<AccountBalance[]> {
  const rows = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      type: financialAccounts.type,
      color: financialAccounts.color,
      isPrimary: financialAccounts.isPrimary,
      balance: sql<string>`(
        "financial_accounts"."opening_balance"::numeric + COALESCE((
          SELECT SUM(CASE WHEN "movements"."type" = 'income' THEN "movements"."amount"::numeric ELSE -"movements"."amount"::numeric END)
          FROM "movements" WHERE "movements"."account_id" = "financial_accounts"."id"
        ), 0)
      )::text`,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.isActive, true))
    .orderBy(desc(financialAccounts.isPrimary), financialAccounts.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    color: r.color,
    isPrimary: r.isPrimary,
    balance: parseFloat(r.balance),
  }));
}
