import Link from "next/link";
import { ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Barra di navigazione fra mesi disponibili (quelli che hanno almeno un
 * movimento). Mostra mese precedente / corrente / successivo, e un bottone
 * per tornare alla vista a card.
 */
export function MonthNavigation({
  currentMonth, // YYYY-MM
  availableMonths, // YYYY-MM[], sortati desc
  extraQs,
}: {
  currentMonth: string;
  availableMonths: string[];
  extraQs: string;
}) {
  const idx = availableMonths.indexOf(currentMonth);
  // Lista è DESC: idx-1 è "più recente" (next), idx+1 è "più vecchio" (prev)
  const newer = idx > 0 ? availableMonths[idx - 1] : null;
  const older = idx >= 0 && idx < availableMonths.length - 1 ? availableMonths[idx + 1] : null;

  const [y, m] = currentMonth.split("-").map(Number);
  const label = m && y ? `${MONTH_LABELS[m - 1]} ${y}` : currentMonth;

  function urlFor(month: string) {
    return `/movimenti?month=${month}${extraQs ? `&${extraQs}` : ""}`;
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
        {older ? (
          <Link
            href={urlFor(older)}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background hover:bg-muted text-xs"
            title={`Vai a ${labelFor(older)}`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {labelFor(older)}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input text-xs text-muted-foreground opacity-50">
            <ChevronLeft className="h-3.5 w-3.5" />
            Più vecchio
          </span>
        )}

        <div className="h-8 px-3 rounded-md bg-muted text-sm font-medium inline-flex items-center">
          {label}
        </div>

        {newer ? (
          <Link
            href={urlFor(newer)}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background hover:bg-muted text-xs"
            title={`Vai a ${labelFor(newer)}`}
          >
            {labelFor(newer)}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input text-xs text-muted-foreground opacity-50">
            Più recente
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

function labelFor(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${MONTH_LABELS[m - 1].slice(0, 3)} ${y}`;
}
