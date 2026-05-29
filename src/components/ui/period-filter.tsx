"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
} from "lucide-react";
import { DayPicker, getDefaultClassNames, type DateRange } from "react-day-picker";
import { it } from "date-fns/locale";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";
import { OverlayModal } from "@/components/ui/overlay-modal";
import {
  currentMonthKey,
  describePeriod,
  type PeriodKind,
  type PeriodValue,
} from "@/lib/period";

// Re-export per comodità ai consumer
export {
  describePeriod,
  periodFromSearchParams,
  periodToQueryString,
  periodToWindow,
  type PeriodKind,
  type PeriodValue,
} from "@/lib/period";

type Props = {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  className?: string;
  /**
   * "full" (default): popover con tutti i preset.
   * "range-only": il bottone apre direttamente il calendario range e si mostra
   *   "attivo" solo se kind === "range". Usato sulla dashboard dove esiste già
   *   una barra dedicata per gli altri preset.
   */
  mode?: "full" | "range-only";
  /** Etichetta del bottone (default: "Periodo"). */
  label?: string;
};

export function PeriodFilter({
  value,
  onChange,
  className,
  mode = "full",
  label = "Periodo",
}: Props) {
  const [open, setOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<
    "range" | "month" | "year" | null
  >(null);
  const ref = useRef<HTMLDivElement>(null);
  const rangeOnly = mode === "range-only";
  // In "range-only" l'attivazione segue solo il kind range; in "full" segue il default
  const isDefault = rangeOnly ? value.kind !== "range" : value.kind === "all";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ kind: "all" });
  }

  function handleButtonClick() {
    if (rangeOnly) {
      // Apre direttamente il calendario range
      setCalendarMode("range");
    } else {
      setOpen(!open);
    }
  }

  // In range-only: se non c'è range selezionato, mostra solo "Personalizzato"
  const buttonText =
    rangeOnly && value.kind !== "range"
      ? "Personalizzato"
      : describePeriod(value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleButtonClick}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          !isDefault
            ? "border-foreground bg-foreground text-background hover:opacity-90"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        <Calendar className="h-3 w-3" />
        {!rangeOnly && (
          <span className={cn("opacity-70", !isDefault && "text-background/80")}>
            {label}:
          </span>
        )}
        <span className="font-medium max-w-44 truncate">{buttonText}</span>
        {!isDefault && (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clear(e as unknown as React.MouseEvent);
              }
            }}
            className="ml-0.5 -mr-1 p-0.5 rounded hover:bg-background/20 cursor-pointer"
            aria-label="Rimuovi filtro"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {isDefault && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        <PeriodPopover
          value={value}
          onPreset={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onPickMonth={() => {
            setCalendarMode("month");
            setOpen(false);
          }}
          onPickYear={() => {
            setCalendarMode("year");
            setOpen(false);
          }}
          onPickRange={() => {
            setCalendarMode("range");
            setOpen(false);
          }}
        />
      )}

      {calendarMode === "range" && (
        <RangeOverlay
          value={value}
          onApply={(p) => {
            onChange(p);
            setCalendarMode(null);
          }}
          onClose={() => setCalendarMode(null)}
        />
      )}

      {calendarMode === "month" && (
        <MonthOverlay
          value={value}
          onApply={(p) => {
            onChange(p);
            setCalendarMode(null);
          }}
          onClose={() => setCalendarMode(null)}
        />
      )}

      {calendarMode === "year" && (
        <YearOverlay
          value={value}
          onApply={(p) => {
            onChange(p);
            setCalendarMode(null);
          }}
          onClose={() => setCalendarMode(null)}
        />
      )}
    </div>
  );
}

function PeriodPopover({
  value,
  onPreset,
  onPickMonth,
  onPickYear,
  onPickRange,
}: {
  value: PeriodValue;
  onPreset: (v: PeriodValue) => void;
  onPickMonth: () => void;
  onPickYear: () => void;
  onPickRange: () => void;
}) {
  const presets: Array<{
    kind: PeriodKind;
    label: string;
    description?: string;
  }> = [
    { kind: "all", label: "Sempre" },
    {
      kind: "month",
      label: "Mese specifico",
      description: "Apri il selettore mesi",
    },
    {
      kind: "full-year",
      label: "Anno specifico",
      description: "Scegli un anno",
    },
    { kind: "quarter", label: "Ultimi 3 mesi" },
    { kind: "half-year", label: "Ultimi 6 mesi" },
    { kind: "year", label: "Ultimi 12 mesi" },
    { kind: "ytd", label: "Anno corrente", description: "Da gennaio fino a oggi" },
    {
      kind: "range",
      label: "Personalizzato",
      description: "Apri il calendario",
    },
  ];

  function pick(kind: PeriodKind) {
    if (kind === "month") onPickMonth();
    else if (kind === "full-year") onPickYear();
    else if (kind === "range") onPickRange();
    else onPreset({ kind });
  }

  return (
    <div className="absolute z-40 left-0 mt-1 w-72 rounded-md border border-border bg-background shadow-lg p-1.5 flex flex-col gap-0.5">
      {presets.map((p) => (
        <button
          key={p.kind}
          type="button"
          onClick={() => pick(p.kind)}
          className={cn(
            "w-full flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors",
            value.kind === p.kind
              ? "bg-foreground text-background"
              : "hover:bg-muted",
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{p.label}</div>
            {p.description && (
              <div
                className={cn(
                  "text-[10px] mt-0.5",
                  value.kind === p.kind
                    ? "text-background/70"
                    : "text-muted-foreground",
                )}
              >
                {p.description}
              </div>
            )}
          </div>
          {value.kind === p.kind && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        </button>
      ))}
    </div>
  );
}

// ===================================================================
// CalendarPicker — wrapping con caption custom (mese/anno grid stile Airbnb)
// ===================================================================

const MONTH_NAMES_FULL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const MONTH_NAMES_SHORT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

type CalendarPickerProps = {
  range?: DateRange | undefined;
  onRangeChange?: (d: DateRange | undefined) => void;
};

function CalendarPicker({ range, onRangeChange }: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState<Date>(
    range?.from ?? new Date(),
  );
  const [view, setView] = useState<"days" | "months" | "years">("days");

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  function shift(delta: number) {
    if (view === "days") {
      const d = new Date(viewMonth);
      d.setMonth(d.getMonth() + delta);
      setViewMonth(d);
    } else if (view === "months") {
      const d = new Date(viewMonth);
      d.setFullYear(d.getFullYear() + delta);
      setViewMonth(d);
    } else {
      const d = new Date(viewMonth);
      d.setFullYear(d.getFullYear() + delta * 10);
      setViewMonth(d);
    }
  }

  function pickMonth(idx: number) {
    const d = new Date(viewMonth);
    d.setMonth(idx);
    setViewMonth(d);
    setView("days");
  }
  function pickYear(y: number) {
    const d = new Date(viewMonth);
    d.setFullYear(y);
    setViewMonth(d);
    setView("months");
  }

  const captionLabel = view === "days" ? MONTH_NAMES_FULL[viewMonth.getMonth()] : null;
  const yearLabel = viewMonth.getFullYear();

  // Decade per il view "years": 10 anni centrati attorno all'attuale viewYear
  const decadeStart = Math.floor(yearLabel / 10) * 10;
  const decadeEnd = decadeStart + 9;

  return (
    <div className="flex flex-col gap-2 select-none w-fit">
      {/* Header custom: anno (sopra) + mese (sotto), cliccabili */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="h-8 w-8 rounded-md border border-border bg-background hover:bg-muted inline-flex items-center justify-center text-foreground"
          aria-label="Precedente"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-col items-center gap-0.5 flex-1">
          <button
            type="button"
            onClick={() =>
              setView((v) => (v === "years" ? "days" : "years"))
            }
            className={cn(
              "text-xs uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted",
              view === "years" && "bg-foreground text-background",
            )}
          >
            {view === "years" ? `${decadeStart}–${decadeEnd}` : yearLabel}
          </button>
          {captionLabel && (
            <button
              type="button"
              onClick={() => setView("months")}
              className={cn(
                "text-base font-semibold px-2 py-0.5 rounded hover:bg-muted",
                view === "months" && "bg-foreground text-background",
              )}
            >
              {captionLabel}
            </button>
          )}
          {view === "months" && (
            <span className="text-base font-semibold">Mese</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => shift(+1)}
          className="h-8 w-8 rounded-md border border-border bg-background hover:bg-muted inline-flex items-center justify-center text-foreground"
          aria-label="Successivo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      {view === "days" && (
        <DaysView
          viewMonth={viewMonth}
          range={range}
          onRangeChange={onRangeChange}
          onMonthChange={setViewMonth}
        />
      )}
      {view === "months" && (
        <MonthsGrid
          year={viewMonth.getFullYear()}
          selectedMonth={viewMonth.getMonth()}
          currentYearMonth={
            yearLabel === currentYear ? currentMonth : null
          }
          onPick={pickMonth}
        />
      )}
      {view === "years" && (
        <YearsGrid
          decadeStart={decadeStart}
          selectedYear={yearLabel}
          currentYear={currentYear}
          onPick={pickYear}
        />
      )}
    </div>
  );
}

function DaysView({
  viewMonth,
  range,
  onRangeChange,
  onMonthChange,
}: {
  viewMonth: Date;
  range?: DateRange;
  onRangeChange?: (d: DateRange | undefined) => void;
  onMonthChange: (d: Date) => void;
}) {
  const def = getDefaultClassNames();
  const dayBase =
    "h-9 w-9 rounded-md text-sm font-medium hover:bg-muted transition-colors";

  const classNames = {
    ...def,
    root: cn(def.root, "text-foreground"),
    months: "flex flex-col gap-1",
    month: "flex flex-col gap-1",
    month_caption: "hidden",
    nav: "hidden",
    month_grid: "w-full border-collapse",
    weekdays: "flex",
    weekday:
      "text-muted-foreground w-9 font-medium text-[10px] uppercase tracking-wider text-center",
    week: "flex w-full mt-0.5",
    day: cn(def.day, "relative p-0 text-center"),
    day_button: cn(dayBase, "border border-transparent"),
    today: "font-bold underline underline-offset-4",
    outside: "text-muted-foreground/40",
    disabled: "text-muted-foreground/40 cursor-not-allowed",
    hidden: "invisible",
    selected: "",
    range_start:
      "[&>button]:bg-foreground [&>button]:text-background [&>button]:rounded-r-none [&>button]:hover:bg-foreground",
    range_end:
      "[&>button]:bg-foreground [&>button]:text-background [&>button]:rounded-l-none [&>button]:hover:bg-foreground",
    range_middle:
      "[&>button]:bg-muted [&>button]:text-foreground [&>button]:rounded-none [&>button]:hover:bg-muted",
  };

  return (
    <DayPicker
      mode="range"
      selected={range}
      onSelect={onRangeChange}
      locale={it}
      weekStartsOn={1}
      numberOfMonths={1}
      month={viewMonth}
      onMonthChange={onMonthChange}
      classNames={classNames}
    />
  );
}

function MonthsGrid({
  year,
  selectedMonth,
  currentYearMonth,
  onPick,
}: {
  year: number;
  selectedMonth: number;
  currentYearMonth: number | null;
  onPick: (idx: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 p-1">
      {MONTH_NAMES_SHORT.map((m, i) => {
        const isSelected = i === selectedMonth;
        const isCurrent = currentYearMonth === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className={cn(
              "h-12 w-20 rounded-md border text-sm font-medium transition-colors",
              isSelected
                ? "bg-foreground text-background border-foreground"
                : isCurrent
                  ? "border-foreground/60 hover:bg-muted"
                  : "border-border hover:bg-muted",
            )}
            title={`${MONTH_NAMES_FULL[i]} ${year}`}
          >
            {m}
            {isCurrent && (
              <div className="text-[9px] opacity-70 leading-none">oggi</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function YearsGrid({
  decadeStart,
  selectedYear,
  currentYear,
  onPick,
}: {
  decadeStart: number;
  selectedYear: number;
  currentYear: number;
  onPick: (year: number) => void;
}) {
  const years = Array.from({ length: 10 }, (_, i) => decadeStart + i);
  return (
    <div className="grid grid-cols-5 gap-1.5 p-1">
      {years.map((y) => {
        const isSelected = y === selectedYear;
        const isCurrent = y === currentYear;
        return (
          <button
            key={y}
            type="button"
            onClick={() => onPick(y)}
            className={cn(
              "h-12 w-12 rounded-md border text-sm font-medium tabular-nums transition-colors",
              isSelected
                ? "bg-foreground text-background border-foreground"
                : isCurrent
                  ? "border-foreground/60 hover:bg-muted"
                  : "border-border hover:bg-muted",
            )}
          >
            {y}
            {isCurrent && (
              <div className="text-[9px] opacity-70 leading-none">oggi</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ===================================================================
// OVERLAY: RANGE CALENDAR
// ===================================================================

function RangeOverlay({
  value,
  onApply,
  onClose,
}: {
  value: PeriodValue;
  onApply: (p: PeriodValue) => void;
  onClose: () => void;
}) {
  const initialRange: DateRange | undefined =
    value.kind === "range" && value.from && value.to
      ? { from: new Date(value.from), to: new Date(value.to) }
      : undefined;
  const [range, setRange] = useState<DateRange | undefined>(initialRange);

  function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function handleApply() {
    if (!range?.from || !range?.to) return;
    onApply({
      kind: "range",
      from: isoDay(range.from),
      to: isoDay(range.to),
    });
  }

  const fmtRange =
    range?.from && range?.to
      ? `${range.from.toLocaleDateString("it-IT")} → ${range.to.toLocaleDateString("it-IT")}`
      : range?.from
        ? `${range.from.toLocaleDateString("it-IT")} → seleziona fine`
        : "Seleziona inizio";

  return (
    <OverlayModal
      title="Seleziona periodo personalizzato"
      icon={<Calendar className="h-4 w-4 text-foreground" />}
      onClose={onClose}
      size="md"
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          Click sul primo giorno, poi sull&apos;ultimo. Le frecce in alto navigano fra
          mesi.
        </div>
        <div className="rounded-md border border-border bg-background p-3 flex justify-center">
          <CalendarPicker range={range} onRangeChange={setRange} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">{fmtRange}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!range?.from || !range?.to}
              className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 disabled:opacity-50"
            >
              Applica
            </button>
          </div>
        </div>
      </div>
    </OverlayModal>
  );
}

// ===================================================================
// OVERLAY: MONTH PICKER (griglia di mesi + frecce anno)
// ===================================================================

const MONTH_GRID = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

function MonthOverlay({
  value,
  onApply,
  onClose,
}: {
  value: PeriodValue;
  onApply: (p: PeriodValue) => void;
  onClose: () => void;
}) {
  const initialMonth = value.kind === "month" && value.month ? value.month : currentMonthKey();
  const [year, setYear] = useState<number>(Number(initialMonth.split("-")[0]));
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const currentYearNow = new Date().getFullYear();
  const currentMonthNow = new Date().getMonth();

  function pick(monthIdx: number) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    setSelectedMonth(key);
  }

  function handleApply() {
    onApply({ kind: "month", month: selectedMonth });
  }

  return (
    <OverlayModal
      title="Seleziona mese"
      icon={<Calendar className="h-4 w-4 text-foreground" />}
      onClose={onClose}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <button
            type="button"
            onClick={() => setYear(year - 1)}
            className="p-1.5 rounded hover:bg-muted text-foreground"
            aria-label="Anno precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-base font-semibold">{year}</div>
          <button
            type="button"
            onClick={() => setYear(year + 1)}
            className="p-1.5 rounded hover:bg-muted text-foreground"
            aria-label="Anno successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTH_GRID.map((label, idx) => {
            const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
            const isSelected = selectedMonth === key;
            const isCurrent = year === currentYearNow && idx === currentMonthNow;
            const isFuture =
              year > currentYearNow ||
              (year === currentYearNow && idx > currentMonthNow);
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(idx)}
                className={cn(
                  "h-12 rounded-md border text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : isCurrent
                      ? "border-foreground/60 hover:bg-muted"
                      : "border-border hover:bg-muted",
                  isFuture && "opacity-50",
                )}
              >
                {label}
                {isCurrent && (
                  <div className="text-[9px] opacity-70 leading-none">oggi</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90"
          >
            Applica
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}

// ===================================================================
// OVERLAY: YEAR PICKER (decade in grid)
// ===================================================================

function YearOverlay({
  value,
  onApply,
  onClose,
}: {
  value: PeriodValue;
  onApply: (p: PeriodValue) => void;
  onClose: () => void;
}) {
  const currentYearNow = new Date().getFullYear();
  const initialYear =
    value.kind === "full-year" && value.year ? value.year : currentYearNow;
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [decadeStart, setDecadeStart] = useState<number>(
    Math.floor(initialYear / 10) * 10,
  );

  function handleApply() {
    onApply({ kind: "full-year", year: selectedYear });
  }

  return (
    <OverlayModal
      title="Seleziona anno"
      icon={<Calendar className="h-4 w-4 text-foreground" />}
      onClose={onClose}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <button
            type="button"
            onClick={() => setDecadeStart(decadeStart - 10)}
            className="p-1.5 rounded hover:bg-muted text-foreground"
            aria-label="Decade precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-base font-semibold tabular-nums">
            {decadeStart}–{decadeStart + 9}
          </div>
          <button
            type="button"
            onClick={() => setDecadeStart(decadeStart + 10)}
            className="p-1.5 rounded hover:bg-muted text-foreground"
            aria-label="Decade successiva"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => decadeStart + i).map((y) => {
            const isSelected = y === selectedYear;
            const isCurrent = y === currentYearNow;
            const isFuture = y > currentYearNow;
            return (
              <button
                key={y}
                type="button"
                onClick={() => setSelectedYear(y)}
                className={cn(
                  "h-12 rounded-md border text-sm font-medium tabular-nums transition-colors",
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : isCurrent
                      ? "border-foreground/60 hover:bg-muted"
                      : "border-border hover:bg-muted",
                  isFuture && "opacity-50",
                )}
              >
                {y}
                {isCurrent && (
                  <div className="text-[9px] opacity-70 leading-none">oggi</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90"
          >
            Applica
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}
