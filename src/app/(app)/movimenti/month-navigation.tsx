import Link from "next/link";
import { ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import { shiftMonth } from "@/lib/period";

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Barra di navigazione tra mesi. Le frecce avanti/indietro sono SEMPRE
 * cliccabili e portano al mese precedente / successivo cronologico, anche
 * se è vuoto (vedi empty state). Niente dipendenza dalla lista dei mesi
 * popolati così l'utente non resta bloccato.
 */
export function MonthNavigation({
  currentMonth, // YYYY-MM
  extraQs,
}: {
  currentMonth: string;
  extraQs: string;
}) {
  const prev = shiftMonth(currentMonth, -1);
  const next = shiftMonth(currentMonth, 1);

  const [y, m] = currentMonth.split("-").map(Number);
  const label = m && y ? `${MONTH_LABELS[m - 1]} ${y}` : currentMonth;

  function urlFor(month: string) {
    return `/movimenti?period=month&month=${month}${extraQs ? `&${extraQs}` : ""}`;
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-background">
      <Link
        href={`/movimenti${extraQs ? `?${extraQs}` : ""}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Grid3x3 className="h-3.5 w-3.5" />
        Tutti i mesi
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href={urlFor(prev)}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background hover:bg-muted text-xs"
          title={`Vai a ${labelFor(prev)}`}
          aria-label={`Mese precedente: ${labelFor(prev)}`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {labelFor(prev)}
        </Link>

        <div className="h-8 px-3 rounded-md bg-muted text-sm font-medium inline-flex items-center">
          {label}
        </div>

        <Link
          href={urlFor(next)}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background hover:bg-muted text-xs"
          title={`Vai a ${labelFor(next)}`}
          aria-label={`Mese successivo: ${labelFor(next)}`}
        >
          {labelFor(next)}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function labelFor(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${MONTH_LABELS[m - 1].slice(0, 3)} ${y}`;
}
