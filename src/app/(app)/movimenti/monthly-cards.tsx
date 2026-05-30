"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Table,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PushDrawer } from "@/components/ui/push-drawer";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getDrawerMonthMovementsAction,
  type DrawerMonthMovement,
} from "./drawer-month-actions";

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export type MonthlyAggregate = {
  month: string; // YYYY-MM
  income: string;
  expense: string;
  count: number;
  transferCount: number;
};

/**
 * Vista mensile a tabella + drawer di dettaglio al click sul mese.
 * - Anno: heading text-3xl + riepilogo entrate/uscite/saldo
 * - Mese: riga con nome, count movimenti, entrate/uscite/saldo
 * - Click su un mese → apre PushDrawer con dettagli + lista movimenti
 */
export function MonthlyCards({
  data,
  extraQs,
  filters,
}: {
  data: MonthlyAggregate[];
  extraQs: string;
  /** Filtri attivi della pagina, propagati al drawer per coerenza dei dati. */
  filters: {
    type?: "income" | "expense";
    accountId?: string;
    categoryIds: string[];
    search?: string;
  };
}) {
  type OpenItem =
    | { kind: "month"; month: string }
    | { kind: "year"; year: number };
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const openMonth =
    openItem?.kind === "month"
      ? data.find((m) => m.month === openItem.month) ?? null
      : null;
  const openYear = openItem?.kind === "year" ? openItem.year : null;

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
    <>
      <div className="flex flex-col gap-10">
        {years.map((year) => {
          const months = byYear.get(year)!;
          return (
            <section key={year} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() =>
                  setOpenItem({ kind: "year", year })
                }
                className="self-start text-3xl font-semibold tracking-tight inline-flex items-center gap-2 cursor-pointer hover:text-foreground/80 transition-colors group"
              >
                {year}
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>

              <div className="@container rounded-lg border border-border bg-card overflow-hidden">
                <MonthsTableHeader />
                <div className="divide-y divide-border">
                {months.map((m, idx) => {
                  // Mese precedente nell'array (mesi ordinati desc → idx+1 è il precedente cronologicamente).
                  // Se idx è ultimo dell'anno, cerco l'ultimo mese dell'anno precedente.
                  let prev: MonthlyAggregate | null = months[idx + 1] ?? null;
                  if (!prev) {
                    const prevYearMonths = byYear.get(year - 1);
                    if (prevYearMonths && prevYearMonths.length > 0) {
                      prev = prevYearMonths[0]; // primo = più recente dell'anno prima
                    }
                  }
                  return (
                    <MonthRow
                      key={m.month}
                      data={m}
                      previous={prev}
                      active={openItem?.kind === "month" && openItem.month === m.month}
                      onClick={() =>
                        setOpenItem({ kind: "month", month: m.month })
                      }
                    />
                  );
                })}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <PushDrawer
        open={!!openMonth}
        onClose={() => setOpenItem(null)}
        title={
          openMonth ? (
            <span>
              {MONTH_LABELS[Number(openMonth.month.slice(5)) - 1]}{" "}
              <span className="text-muted-foreground font-normal">
                {openMonth.month.slice(0, 4)}
              </span>
            </span>
          ) : null
        }
        subtitle={
          openMonth
            ? `${openMonth.count} ${openMonth.count === 1 ? "movimento" : "movimenti"}`
            : undefined
        }

      >
        {openMonth && (
          <MonthDetailContent
            data={openMonth}
            previous={previousFor(openMonth, data, byYear)}
            extraQs={extraQs}
            filters={filters}
          />
        )}
      </PushDrawer>

      <PushDrawer
        open={openYear != null}
        onClose={() => setOpenItem(null)}
        title={openYear != null ? <span>Anno {openYear}</span> : null}
        subtitle={
          openYear != null
            ? `${(byYear.get(openYear) ?? []).length} mesi con movimenti`
            : undefined
        }

      >
        {openYear != null && (
          <YearDetailContent
            year={openYear}
            months={byYear.get(openYear) ?? []}
            previousMonths={byYear.get(openYear - 1) ?? []}
            extraQs={extraQs}
          />
        )}
      </PushDrawer>
    </>
  );
}

function MonthRow({
  data,
  previous,
  active,
  onClick,
}: {
  data: MonthlyAggregate;
  previous: MonthlyAggregate | null;
  active: boolean;
  onClick: () => void;
}) {
  const mm = Number(data.month.slice(5));
  const label = MONTH_LABELS[mm - 1];
  const income = parseFloat(data.income);
  const expense = parseFloat(data.expense);
  const saldo = income - expense;

  // Andamento = variazione % del saldo vs mese precedente.
  // Se non c'è precedente o il precedente è 0, non mostro nulla.
  const prevSaldo = previous
    ? parseFloat(previous.income) - parseFloat(previous.expense)
    : null;
  const trend =
    prevSaldo != null && Math.abs(prevSaldo) > 0.005
      ? ((saldo - prevSaldo) / Math.abs(prevSaldo)) * 100
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left flex items-center gap-5 px-5 py-3.5 cursor-pointer transition-colors " +
        (active ? "bg-muted/60" : "hover:bg-muted/40")
      }
    >
      <div className="shrink-0">
        <TrendBadge trend={trend} />
      </div>
      <div className="min-w-[100px] @lg:min-w-[140px] flex items-center">
        <div className="text-sm @lg:text-base font-semibold text-foreground">
          {label}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-2 @md:gap-3 @xl:gap-4">
        <StatValue value={`+${formatCurrency(income)}`} loss={false} />
        <StatValue value={`−${formatCurrency(expense)}`} loss={false} />
        <StatValue
          value={`${saldo >= 0 ? "+" : "−"}${formatCurrency(Math.abs(saldo))}`}
          loss={saldo < 0}
        />
        <StatValue
          value={
            trend == null
              ? "—"
              : `${trend >= 0 ? "+" : "−"}${Math.abs(trend).toFixed(1)}%`
          }
          loss={false}
        />
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/**
 * Header tabella mensile: label colonne mostrate una sola volta sopra
 * le righe. Le label scompaiono dentro le righe (vedi MonthRow).
 * Riserva una cella vuota per il TrendBadge a sinistra.
 */
function MonthsTableHeader() {
  return (
    <div className="flex items-center gap-5 px-5 py-2.5 border-b border-border bg-muted/30 text-[10px] @lg:text-[11px] uppercase tracking-wider text-muted-foreground">
      {/* cerchio andamento (no header label) */}
      <div className="w-9 shrink-0" />
      <div className="min-w-[100px] @lg:min-w-[140px]">Mese</div>
      <div className="flex-1 grid grid-cols-4 gap-2 @md:gap-3 @xl:gap-4">
        <span>Entrate</span>
        <span>Uscite</span>
        <span>Saldo</span>
        <span>Andamento</span>
      </div>
      {/* spazio per ChevronRight a destra */}
      <div className="w-4" />
    </div>
  );
}

/**
 * Cerchio colorato con icona TrendingUp/Down. Mostra a colpo d'occhio
 * la direzione del mese:
 *  - trend < 0 → cerchio rosso con freccia in giù
 *  - trend >= 0 → cerchio neutro con freccia in su
 *  - trend null (no dato precedente) → placeholder vuoto
 */
function TrendBadge({ trend }: { trend: number | null }) {
  if (trend == null) {
    return (
      <div
        className="h-9 w-9 rounded-full border border-dashed border-border"
        aria-hidden
      />
    );
  }
  const isLoss = trend < 0;
  return (
    <div
      className={
        "h-9 w-9 rounded-full inline-flex items-center justify-center border " +
        (isLoss
          ? "border-danger/50 bg-danger/10 text-danger"
          : "border-foreground/30 bg-foreground/5 text-muted-foreground")
      }
      aria-label={isLoss ? "Andamento in calo" : "Andamento in crescita"}
    >
      {isLoss ? (
        <TrendingDown className="h-4 w-4" />
      ) : (
        <TrendingUp className="h-4 w-4" />
      )}
    </div>
  );
}

/**
 * Valore di una colonna stat nella riga mese (solo valore, niente label
 * — la label vive nell'header tabella).
 * Convenzione colori: tutto bianco tranne perdite (loss=true) in rosso.
 */
function StatValue({
  value,
  loss,
  icon,
}: {
  value: string;
  loss: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={
        "text-xs @md:text-sm @xl:text-base font-medium tabular-nums inline-flex items-center gap-1 @md:gap-1.5 truncate " +
        (loss ? "text-danger" : "text-foreground")
      }
    >
      {icon}
      {value}
    </span>
  );
}

/* ─── Drawer content ──────────────────────────────────────────────────────── */

/**
 * Helper: trova il mese cronologicamente precedente a `current` nella lista.
 * I dati sono ordinati: anno desc + mesi desc all'interno. Il "precedente"
 * di un mese è il successivo nell'array (più vecchio). Se il current è
 * l'ultimo dell'anno, cerca l'ultimo mese dell'anno precedente.
 */
function previousFor(
  current: MonthlyAggregate,
  allData: MonthlyAggregate[],
  byYear: Map<number, MonthlyAggregate[]>,
): MonthlyAggregate | null {
  const year = Number(current.month.slice(0, 4));
  const months = byYear.get(year) ?? [];
  const idx = months.findIndex((m) => m.month === current.month);
  if (idx >= 0 && months[idx + 1]) return months[idx + 1];
  const prevYearMonths = byYear.get(year - 1);
  if (prevYearMonths && prevYearMonths.length > 0) return prevYearMonths[0];
  void allData;
  return null;
}

function MonthDetailContent({
  data,
  previous,
  extraQs,
  filters,
}: {
  data: MonthlyAggregate;
  previous: MonthlyAggregate | null;
  extraQs: string;
  filters: {
    type?: "income" | "expense";
    accountId?: string;
    categoryIds: string[];
    search?: string;
  };
}) {
  const income = parseFloat(data.income);
  const expense = parseFloat(data.expense);
  const saldo = income - expense;

  const prevIncome = previous ? parseFloat(previous.income) : null;
  const prevExpense = previous ? parseFloat(previous.expense) : null;
  const prevSaldo =
    prevIncome != null && prevExpense != null ? prevIncome - prevExpense : null;

  const trendIncome =
    prevIncome != null && Math.abs(prevIncome) > 0.005
      ? ((income - prevIncome) / Math.abs(prevIncome)) * 100
      : null;
  const trendExpense =
    prevExpense != null && Math.abs(prevExpense) > 0.005
      ? ((expense - prevExpense) / Math.abs(prevExpense)) * 100
      : null;
  const trendSaldo =
    prevSaldo != null && Math.abs(prevSaldo) > 0.005
      ? ((saldo - prevSaldo) / Math.abs(prevSaldo)) * 100
      : null;

  // Importo medio per movimento (totale movimentato / count)
  const totalMoved = income + expense;
  const avgMovement = data.count > 0 ? totalMoved / data.count : 0;

  // % entrate vs uscite (sul totale movimentato)
  const incomePct = totalMoved > 0 ? (income / totalMoved) * 100 : 0;
  const expensePct = totalMoved > 0 ? (expense / totalMoved) * 100 : 0;

  const tableHref = `/movimenti?period=month&month=${data.month}${
    extraQs ? `&${extraQs}` : ""
  }`;

  return (
    <div className="flex flex-col">
      <YearStat
        label="Entrate"
        value={`+${formatCurrency(income)}`}
        loss={false}
        trend={trendIncome}
      />
      <YearStat
        label="Uscite"
        value={`−${formatCurrency(expense)}`}
        loss={false}
        trend={trendExpense}
        trendInverted
      />
      <YearStat
        label="Saldo"
        value={`${saldo >= 0 ? "+" : "−"}${formatCurrency(Math.abs(saldo))}`}
        loss={saldo < 0}
        trend={trendSaldo}
      />
      <YearStat
        label="Andamento vs mese precedente"
        value={
          trendSaldo == null
            ? "—"
            : `${trendSaldo >= 0 ? "+" : "−"}${Math.abs(trendSaldo).toFixed(1)}%`
        }
        loss={trendSaldo != null && trendSaldo < 0}
        big
      />
      <YearStat
        label="Movimenti"
        value={data.count.toLocaleString("it-IT")}
        loss={false}
        hint={
          data.transferCount > 0
            ? `${data.transferCount} trasferimenti`
            : undefined
        }
      />
      <YearStat
        label="Importo medio movimento"
        value={formatCurrency(avgMovement)}
        loss={false}
      />
      <YearStat
        label="Distribuzione"
        value={`${incomePct.toFixed(0)}% entrate · ${expensePct.toFixed(0)}% uscite`}
        loss={false}
      />

      <div className="pt-5">
        <Link href={tableHref}>
          <Button variant="secondary" className="w-full gap-2">
            <Table className="h-4 w-4" />
            Apri tabella completa del mese
          </Button>
        </Link>
      </div>

      <MonthMovementsList month={data.month} filters={filters} />
    </div>
  );
}

function MonthMovementsList({
  month,
  filters,
}: {
  month: string;
  filters: {
    type?: "income" | "expense";
    accountId?: string;
    categoryIds: string[];
    search?: string;
  };
}) {
  const [rows, setRows] = useState<DrawerMonthMovement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRows([]);
    setHasMore(false);
    setTotal(0);
    setLoaded(false);
    startTransition(async () => {
      const res = await getDrawerMonthMovementsAction({
        month,
        offset: 0,
        type: filters.type,
        accountId: filters.accountId,
        categoryIds: filters.categoryIds,
        search: filters.search,
      });
      setRows(res.rows);
      setHasMore(res.hasMore);
      setTotal(res.total);
      setLoaded(true);
    });
  }, [
    month,
    filters.type,
    filters.accountId,
    filters.search,
    // categoryIds è un array: serializzo per dipendenza stabile
    filters.categoryIds.join(","),
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function loadMore() {
    startTransition(async () => {
      const res = await getDrawerMonthMovementsAction({
        month,
        offset: rows.length,
        type: filters.type,
        accountId: filters.accountId,
        categoryIds: filters.categoryIds,
        search: filters.search,
      });
      setRows((prev) => [...prev, ...res.rows]);
      setHasMore(res.hasMore);
    });
  }

  return (
    <div className="border-t border-border pt-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Movimenti del mese
        </div>
        {loaded && total > 0 && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {rows.length} di {total}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="py-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Nessun movimento in questo mese.
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-background overflow-hidden">
            {rows.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </ul>

          {hasMore && (
            <div className="flex items-center justify-center pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={pending}
                className="gap-1.5 text-xs"
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                Carica di più
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MovementRow({ movement }: { movement: DrawerMonthMovement }) {
  const isIncome = movement.type === "income";
  const display = movement.descriptionClean ?? movement.description;
  const amount = parseFloat(movement.amount);

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      {isIncome ? (
        <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0 mt-1" />
      ) : (
        <ArrowDownLeft className="h-3.5 w-3.5 text-danger shrink-0 mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground line-clamp-2 break-words">
          {display}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
          <span className="tabular-nums">{formatDate(movement.date)}</span>
          {movement.categoryName && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {movement.categoryColor && (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: movement.categoryColor }}
                  />
                )}
                {movement.categoryName}
              </span>
            </>
          )}
        </div>
      </div>
      <div
        className={
          "tabular-nums font-medium text-sm shrink-0 " +
          (isIncome ? "text-success" : "text-danger")
        }
      >
        {isIncome ? "+" : "−"}
        {formatCurrency(Math.abs(amount))}
      </div>
    </li>
  );
}

/* ─── Drawer ANNO ─────────────────────────────────────────────────────────── */

function YearDetailContent({
  year,
  months,
  previousMonths,
  extraQs,
}: {
  year: number;
  months: MonthlyAggregate[];
  previousMonths: MonthlyAggregate[];
  extraQs: string;
}) {
  const income = months.reduce((s, m) => s + parseFloat(m.income), 0);
  const expense = months.reduce((s, m) => s + parseFloat(m.expense), 0);
  const saldo = income - expense;
  const movementsCount = months.reduce((s, m) => s + m.count, 0);
  const transferCount = months.reduce((s, m) => s + m.transferCount, 0);

  // Per il confronto YoY usiamo SOLO gli stessi mesi-numero presenti
  // nell'anno corrente. Es. se ho gen-mag 2026, confronto con gen-mag 2025.
  // Evita il bias "5 mesi vs 12 mesi" che fa sembrare l'anno in corso in crollo.
  const currentMonthNumbers = new Set(
    months.map((m) => Number(m.month.slice(5))),
  );
  const previousSameWindow = previousMonths.filter((m) =>
    currentMonthNumbers.has(Number(m.month.slice(5))),
  );
  const prevIncome = previousSameWindow.reduce(
    (s, m) => s + parseFloat(m.income),
    0,
  );
  const prevExpense = previousSameWindow.reduce(
    (s, m) => s + parseFloat(m.expense),
    0,
  );
  const prevSaldo = prevIncome - prevExpense;
  const isPartialYear = months.length < 12;

  const trendSaldo =
    Math.abs(prevSaldo) > 0.005
      ? ((saldo - prevSaldo) / Math.abs(prevSaldo)) * 100
      : null;
  const trendIncome =
    Math.abs(prevIncome) > 0.005
      ? ((income - prevIncome) / Math.abs(prevIncome)) * 100
      : null;
  const trendExpense =
    Math.abs(prevExpense) > 0.005
      ? ((expense - prevExpense) / Math.abs(prevExpense)) * 100
      : null;

  // Mese migliore/peggiore per saldo
  const monthsWithSaldo = months.map((m) => ({
    month: m.month,
    saldo: parseFloat(m.income) - parseFloat(m.expense),
  }));
  const best =
    monthsWithSaldo.length > 0
      ? monthsWithSaldo.reduce((a, b) => (a.saldo >= b.saldo ? a : b))
      : null;
  const worst =
    monthsWithSaldo.length > 0
      ? monthsWithSaldo.reduce((a, b) => (a.saldo <= b.saldo ? a : b))
      : null;

  const tableHref = `/movimenti?period=year&year=${year}${
    extraQs ? `&${extraQs}` : ""
  }`;

  return (
    <div className="flex flex-col">
      <YearStat
        label="Entrate complessive"
        value={`+${formatCurrency(income)}`}
        loss={false}
        trend={trendIncome}
      />
      <YearStat
        label="Uscite complessive"
        value={`−${formatCurrency(expense)}`}
        loss={false}
        trend={trendExpense}
        // L'andamento delle uscite è "perdita" se cresce: invertito vs entrate/saldo
        trendInverted
      />
      <YearStat
        label="Saldo"
        value={`${saldo >= 0 ? "+" : "−"}${formatCurrency(Math.abs(saldo))}`}
        loss={saldo < 0}
        trend={trendSaldo}
      />
      <YearStat
        label={
          isPartialYear && previousSameWindow.length > 0
            ? `Andamento vs stesso periodo ${year - 1}`
            : "Andamento vs anno precedente"
        }
        value={
          trendSaldo == null
            ? "—"
            : `${trendSaldo >= 0 ? "+" : "−"}${Math.abs(trendSaldo).toFixed(1)}%`
        }
        loss={trendSaldo != null && trendSaldo < 0}
        big
        hint={
          isPartialYear && previousSameWindow.length > 0
            ? `${months.length} ${months.length === 1 ? "mese" : "mesi"} a confronto`
            : undefined
        }
      />
      <YearStat
        label="Movimenti totali"
        value={movementsCount.toLocaleString("it-IT")}
        loss={false}
        hint={
          transferCount > 0
            ? `${transferCount} trasferimenti tra conti`
            : undefined
        }
      />
      {best && worst && best.month !== worst.month && (
        <>
          <YearStat
            label="Miglior mese"
            value={MONTH_LABELS[Number(best.month.slice(5)) - 1]}
            loss={false}
            hint={`+${formatCurrency(best.saldo)}`}
          />
          <YearStat
            label="Peggior mese"
            value={MONTH_LABELS[Number(worst.month.slice(5)) - 1]}
            loss={worst.saldo < 0}
            hint={`${worst.saldo >= 0 ? "+" : "−"}${formatCurrency(Math.abs(worst.saldo))}`}
          />
        </>
      )}

      <div className="pt-5">
        <Link href={tableHref}>
          <Button variant="secondary" className="w-full gap-2">
            <Table className="h-4 w-4" />
            Apri tabella movimenti {year}
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Riga "label + valore grande" del drawer anno. Niente card, separatori
 * sottili tra le righe. Stessa convenzione colori: bianco tranne perdite.
 */
function YearStat({
  label,
  value,
  loss,
  trend,
  trendInverted,
  hint,
  big,
}: {
  label: string;
  value: string;
  loss: boolean;
  trend?: number | null;
  /** Per "uscite": un trend POSITIVO (cresce) è una perdita. */
  trendInverted?: boolean;
  hint?: string;
  big?: boolean;
}) {
  const trendIsLoss =
    trend == null
      ? false
      : trendInverted
        ? trend > 0
        : trend < 0;
  return (
    <div className="py-2.5 @lg:py-3 border-b border-border last:border-b-0">
      <div className="text-[10px] @lg:text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-2 @lg:gap-3 flex-wrap">
        <span
          className={
            "tabular-nums font-semibold inline-flex items-center gap-1.5 @lg:gap-2 " +
            (big ? "text-xl @lg:text-3xl" : "text-lg @lg:text-2xl") +
            " " +
            (loss ? "text-danger" : "text-foreground")
          }
        >
          {trend != null && !big && (
            trendIsLoss ? (
              <TrendingDown className="h-3.5 w-3.5 @lg:h-4 @lg:w-4 text-danger" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 @lg:h-4 @lg:w-4 text-muted-foreground" />
            )
          )}
          {value}
        </span>
        {trend != null && !big && (
          <span
            className={
              "text-xs tabular-nums " +
              (trendIsLoss ? "text-danger" : "text-muted-foreground")
            }
          >
            {trend >= 0 ? "+" : "−"}
            {Math.abs(trend).toFixed(1)}% vs anno prec.
          </span>
        )}
        {hint && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
