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
 *  - Selettore anno (← anno →) — al cambio applica subito "Anno X"
 *  - Quick buttons rolling: Ultimi 3 / 6 / 12 mesi
 *  - Dropdown trimestre Q1-Q4 (sull'anno selezionato)
 *  - PeriodFilter completo (Mese specifico, Personalizzato)
 *
 * Default dashboard = full-year dell'anno corrente.
 */
export function DashboardPeriodBar({ initialPeriod }: { initialPeriod: PeriodValue }) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();

  // Anno mostrato nel selettore. Deriva dall'initialPeriod, fallback corrente.
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

  function setYear(y: number) {
    setBarYear(y);
    apply({ kind: "full-year", year: y });
  }

  function applyQuarterRolling() {
    apply({ kind: "quarter" });
  }
  function applyHalfYearRolling() {
    apply({ kind: "half-year" });
  }
  function applyYearRolling() {
    apply({ kind: "year" });
  }
  function applySpecificQuarter(q: 1 | 2 | 3 | 4) {
    apply({ kind: "quarter-of-year", year: barYear, quarter: q });
  }

  const isFullYearActive =
    initialPeriod.kind === "full-year" && (initialPeriod.year ?? currentYear) === barYear;
  const isQuarterRolling = initialPeriod.kind === "quarter";
  const isHalfYearRolling = initialPeriod.kind === "half-year";
  const isYearRolling = initialPeriod.kind === "year";
  const activeQuarter =
    initialPeriod.kind === "quarter-of-year" &&
    (initialPeriod.year ?? currentYear) === barYear
      ? initialPeriod.quarter
      : null;

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* Selettore anno: al cambio applica subito "Anno X" */}
      <div
        className={cn(
          "inline-flex items-center gap-0.5 h-8 rounded-md border overflow-hidden",
          isFullYearActive
            ? "border-foreground bg-foreground text-background"
            : "border-input bg-background text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setYear(barYear - 1)}
          className={cn(
            "h-full px-2 transition-colors",
            isFullYearActive ? "hover:bg-background/10" : "hover:bg-muted",
          )}
          aria-label="Anno precedente"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setYear(barYear)}
          className="px-2 text-xs font-medium tabular-nums"
          title={`Mostra anno ${barYear}`}
        >
          {barYear}
        </button>
        <button
          type="button"
          onClick={() => setYear(barYear + 1)}
          className={cn(
            "h-full px-2 transition-colors",
            isFullYearActive ? "hover:bg-background/10" : "hover:bg-muted",
          )}
          aria-label="Anno successivo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick rolling */}
      <QuickButton
        label="Ultimi 3 mesi"
        active={isQuarterRolling}
        onClick={applyQuarterRolling}
      />
      <QuickButton
        label="Ultimi 6 mesi"
        active={isHalfYearRolling}
        onClick={applyHalfYearRolling}
      />
      <QuickButton
        label="Ultimi 12 mesi"
        active={isYearRolling}
        onClick={applyYearRolling}
      />

      {/* Dropdown trimestre */}
      <QuarterDropdown
        year={barYear}
        active={activeQuarter ?? null}
        onPick={applySpecificQuarter}
      />

      {/* PeriodFilter completo (Mese specifico / Personalizzato) */}
      <PeriodFilter value={initialPeriod} onChange={apply} />
    </div>
  );
}

function QuickButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 inline-flex items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
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
