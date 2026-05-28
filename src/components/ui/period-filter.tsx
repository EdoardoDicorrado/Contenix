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
};

export function PeriodFilter({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"range" | "month" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isDefault = value.kind === "all";

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

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          !isDefault
            ? "border-foreground bg-foreground text-background hover:opacity-90"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        <Calendar className="h-3 w-3" />
        <span className={cn("opacity-70", !isDefault && "text-background/80")}>
          Periodo:
        </span>
        <span className="font-medium max-w-44 truncate">{describePeriod(value)}</span>
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
    </div>
  );
}

function PeriodPopover({
  value,
  onPreset,
  onPickMonth,
  onPickRange,
}: {
  value: PeriodValue;
  onPreset: (v: PeriodValue) => void;
  onPickMonth: () => void;
  onPickRange: () => void;
}) {
  const presets: Array<{
    kind: PeriodKind;
    label: string;
    description?: string;
    needsCalendar?: boolean;
  }> = [
    { kind: "all", label: "Sempre" },
    {
      kind: "month",
      label: "Mese specifico",
      description: "Apri il selettore mesi",
      needsCalendar: true,
    },
    { kind: "quarter", label: "Ultimi 3 mesi" },
    { kind: "ytd", label: "Anno corrente", description: "Da gennaio fino a oggi" },
    { kind: "year", label: "Ultimi 12 mesi" },
    {
      kind: "range",
      label: "Personalizzato",
      description: "Apri il calendario",
      needsCalendar: true,
    },
  ];

  function pick(kind: PeriodKind) {
    if (kind === "month") onPickMonth();
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
// DayPickerStyled — wrapping con classi Tailwind coerenti col tema
// ===================================================================

type DayPickerStyledProps = {
  mode: "range" | "single";
  selected?: DateRange | Date | undefined;
  onSelect?: ((d: DateRange | undefined) => void) | ((d: Date | undefined) => void);
};

function DayPickerStyled(props: DayPickerStyledProps) {
  const def = getDefaultClassNames();
  const currentYear = new Date().getFullYear();

  // Classi shared per la cella giorno (l'override più importante)
  const dayBase =
    "h-9 w-9 rounded-md text-sm font-medium hover:bg-muted transition-colors";

  const classNames = {
    ...def,
    // Container
    root: cn(def.root, "text-foreground"),
    months: "flex flex-col gap-3",
    month: "flex flex-col gap-3",

    // Header con label e frecce
    month_caption: "flex items-center justify-center px-2 pt-1 pb-2",
    caption_label: "text-sm font-semibold",
    dropdowns: "flex items-center gap-1",
    months_dropdown:
      "h-8 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-muted cursor-pointer",
    years_dropdown:
      "h-8 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-muted cursor-pointer",

    // Frecce navigazione
    nav: "flex items-center justify-between absolute top-1 inset-x-2 z-10 pointer-events-none",
    button_previous:
      "h-8 w-8 rounded-md border border-border bg-background hover:bg-muted pointer-events-auto inline-flex items-center justify-center text-foreground transition-colors",
    button_next:
      "h-8 w-8 rounded-md border border-border bg-background hover:bg-muted pointer-events-auto inline-flex items-center justify-center text-foreground transition-colors",

    // Griglia
    month_grid: "w-full border-collapse",
    weekdays: "flex",
    weekday:
      "text-muted-foreground w-9 font-medium text-[10px] uppercase tracking-wider text-center",
    week: "flex w-full mt-1",

    // Cella giorno
    day: cn(def.day, "relative p-0 text-center"),
    day_button: cn(
      dayBase,
      "border border-transparent",
    ),

    // Stati
    today: "font-bold underline underline-offset-4",
    outside: "text-muted-foreground/40",
    disabled: "text-muted-foreground/40 cursor-not-allowed",
    hidden: "invisible",

    // Selezione singola
    selected: "",

    // Range
    range_start:
      "[&>button]:bg-foreground [&>button]:text-background [&>button]:rounded-r-none [&>button]:hover:bg-foreground",
    range_end:
      "[&>button]:bg-foreground [&>button]:text-background [&>button]:rounded-l-none [&>button]:hover:bg-foreground",
    range_middle:
      "[&>button]:bg-muted [&>button]:text-foreground [&>button]:rounded-none [&>button]:hover:bg-muted",
  };

  if (props.mode === "range") {
    return (
      <DayPicker
        mode="range"
        selected={props.selected as DateRange | undefined}
        onSelect={props.onSelect as (d: DateRange | undefined) => void}
        locale={it}
        weekStartsOn={1}
        numberOfMonths={1}
        captionLayout="dropdown"
        startMonth={new Date(2010, 0)}
        endMonth={new Date(currentYear + 2, 11)}
        classNames={classNames}
      />
    );
  }
  return (
    <DayPicker
      mode="single"
      selected={props.selected as Date | undefined}
      onSelect={props.onSelect as (d: Date | undefined) => void}
      locale={it}
      weekStartsOn={1}
      numberOfMonths={1}
      captionLayout="dropdown"
      startMonth={new Date(2010, 0)}
      endMonth={new Date(currentYear + 2, 11)}
      classNames={classNames}
    />
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
          <DayPickerStyled
            mode="range"
            selected={range}
            onSelect={setRange}
          />
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
