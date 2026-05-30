/**
 * Riga "label + valore grande" usata nelle sync card del drawer.
 * Stesso pattern di YearStat in /movimenti: niente card, separatore sottile
 * tra righe, tutto bianco tranne le perdite in rosso.
 */
export function SyncStatRow({
  label,
  value,
  hint,
  loss,
}: {
  label: string;
  value: string | number;
  hint?: string;
  loss?: boolean;
}) {
  return (
    <div className="py-2.5 @lg:py-3 border-b border-border last:border-b-0">
      <div className="text-[10px] @lg:text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-2 @lg:gap-3 flex-wrap">
        <span
          className={
            "text-lg @lg:text-2xl font-semibold tabular-nums " +
            (loss ? "text-danger" : "text-foreground")
          }
        >
          {value}
        </span>
        {hint && (
          <span className="text-[11px] @lg:text-xs text-muted-foreground tabular-nums">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
