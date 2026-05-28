"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { PeriodFilter } from "@/components/ui/period-filter";
import {
  periodToQueryString,
  type PeriodValue,
} from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * Barra periodo della dashboard:
 *  - Selettore anno (← anno →)
 *  - Quick buttons: Mese corrente · Ultimi 3 mesi · Da inizio anno · Anno intero
 *  - Dropdown trimestre Q1-Q4 (applicato all'anno selezionato)
 *  - PeriodFilter completo con calendari (Personalizzato, Mese specifico)
 */
export function DashboardPeriodBar({ initialPeriod }: { initialPeriod: PeriodValue }) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth();

  // Anno corrente nella barra: deriva da `initialPeriod.year` per i kind che lo usano,
  // altrimenti dall'anno odierno.
  const initialBarYear =
    initialPeriod.year ??
    (initialPeriod.kind === "month" && initialPeriod.month
      ? Number(initialPeriod.month.split("-")[0])
      : currentYear);
  const [barYear, setBarYear] = useState<number>(initialBarYear);

  function apply(p: PeriodValue) {
    const qs = periodToQueryString(p);
    router.push(qs ? `/?${qs}` : "/");
  }

  function applyQuickMonth() {
    if (barYear !== currentYear) return; // disabilitato fuori dall'anno corrente
    const key = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    apply({ kind: "month", month: key });
  }
  function applyQuickQuarter() {
    apply({ kind: "quarter" });
  }
  function applyQuickYtd() {
    apply({ kind: "ytd", year: barYear });
  }
  function applyQuickFullYear() {
    apply({ kind: "full-year", year: barYear });
  }
  function applyQuarter(q: 1 | 2 | 3 | 4) {
    apply({ kind: "quarter-of-year", year: barYear, quarter: q });
  }

  // Match attivo
  const isQuickMonth =
    initialPeriod.kind === "month" &&
    initialPeriod.month ===
      `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  const isQuickQuarter = initialPeriod.kind === "quarter";
  const isQuickYtd =
    initialPeriod.kind === "ytd" && (initialPeriod.year ?? currentYear) === barYear;
  const isQuickFullYear =
    initialPeriod.kind === "full-year" && (initialPeriod.year ?? currentYear) === barYear;
  const activeQuarter =
    initialPeriod.kind === "quarter-of-year" &&
    (initialPeriod.year ?? currentYear) === barYear
      ? initialPeriod.quarter
      : null;

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* Selettore anno */}
      <div className="inline-flex items-center gap-0.5 h-8 rounded-md border border-input bg-background overflow-hidden">
        <button
          type="button"
          onClick={() => setBarYear(barYear - 1)}
          className="h-full px-2 hover:bg-muted text-foreground"
          aria-label="Anno precedente"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 text-xs font-medium tabular-nums">{barYear}</span>
        <button
          type="button"
          onClick={() => setBarYear(barYear + 1)}
          className="h-full px-2 hover:bg-muted text-foreground"
          aria-label="Anno successivo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick buttons */}
      <QuickButton
        label="Mese corrente"
        active={isQuickMonth}
        onClick={applyQuickMonth}
        disabled={barYear !== currentYear}
        title={
          barYear !== currentYear
            ? "Disponibile solo nell'anno corrente"
            : "Mostra solo il mese in corso"
        }
      />
      <QuickButton
        label="Ultimi 3 mesi"
        active={isQuickQuarter}
        onClick={applyQuickQuarter}
        title="Trimestre rolling dall'oggi"
      />
      <QuickButton
        label={`Da inizio ${barYear}`}
        active={isQuickYtd}
        onClick={applyQuickYtd}
      />
      <QuickButton
        label={`Anno ${barYear}`}
        active={isQuickFullYear}
        onClick={applyQuickFullYear}
      />

      {/* Dropdown trimestre */}
      <QuarterDropdown
        year={barYear}
        active={activeQuarter ?? null}
        onPick={(q) => applyQuarter(q)}
      />

      {/* PeriodFilter completo (per Mese specifico / Personalizzato) */}
      <PeriodFilter value={initialPeriod} onChange={apply} />
    </div>
  );
}

function QuickButton({
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 inline-flex items-center rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        active
          ? "border-foreground bg-foreground text-background hover:opacity-90"
          : "border-input bg-background text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function QuarterDropdown({
  year,
  active,
  onPick,
}: {
  year: number;
  active: 1 | 2 | 3 | 4 | null;
  onPick: (q: 1 | 2 | 3 | 4) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: Array<{ q: 1 | 2 | 3 | 4; label: string; range: string }> = [
    { q: 1, label: "1° trimestre", range: "Gen — Mar" },
    { q: 2, label: "2° trimestre", range: "Apr — Giu" },
    { q: 3, label: "3° trimestre", range: "Lug — Set" },
    { q: 4, label: "4° trimestre", range: "Ott — Dic" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
          active
            ? "border-foreground bg-foreground text-background hover:opacity-90"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        {active ? `Q${active} ${year}` : "Trimestre"}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      {open && (
        <div className="absolute z-40 right-0 mt-1 w-48 rounded-md border border-border bg-background shadow-lg p-1">
          {options.map((o) => (
            <button
              key={o.q}
              type="button"
              onClick={() => {
                onPick(o.q);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors",
                active === o.q
                  ? "bg-foreground text-background font-medium"
                  : "hover:bg-muted",
              )}
            >
              <div className="flex flex-col">
                <span>{o.label}</span>
                <span
                  className={cn(
                    "text-[10px]",
                    active === o.q ? "text-background/70" : "text-muted-foreground",
                  )}
                >
                  {o.range} {year}
                </span>
              </div>
              {active === o.q && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
