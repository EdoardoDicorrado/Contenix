import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/utils";
import {
  countChangeLogEntries,
  listChangePairs,
} from "@/lib/db/queries/category-change-log";
import { ArchivePrompt } from "./archive-prompt";

const ARCHIVE_THRESHOLD = 100;

const SOURCE_LABELS: Record<string, string> = {
  sync: "Sincronizzazione",
  inline: "Modifica al volo",
  manual: "Form modifica",
  bulk: "Bulk Da rivedere",
  "rule-new": "Nuova regola",
  import: "Import",
};

export default async function StoricoCambiamentiPage() {
  const [pairs, totalEntries] = await Promise.all([
    listChangePairs(),
    countChangeLogEntries(),
  ]);
  const totalChanges = pairs.reduce((s, p) => s + p.count, 0);
  const showArchivePrompt = totalEntries > ARCHIVE_THRESHOLD;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          Storico cambiamenti
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ogni sostituzione di categoria è raggruppata in una card{" "}
          <span className="font-mono">origine → destinazione</span>. Click per vedere
          tutti i movimenti coinvolti.
          {pairs.length > 0 && (
            <>
              {" "}
              <span className="text-foreground font-medium">{totalChanges}</span> cambi in{" "}
              <span className="text-foreground font-medium">{pairs.length}</span>{" "}
              {pairs.length === 1 ? "coppia" : "coppie"}.
            </>
          )}
        </p>
      </div>

      {showArchivePrompt && <ArchivePrompt totalCount={totalEntries} />}

      {pairs.length === 0 ? (
        <EmptyState
          title="Nessun cambiamento registrato"
          description={
            "I cambi di categoria — sia automatici (sincronizzazione) sia manuali — verranno registrati qui dal momento in cui sono avvenuti."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pairs.map((p) => (
            <Link
              key={`${p.fromLabel}|${p.toLabel}`}
              href={`/storico-cambiamenti/dettaglio?from=${encodeURIComponent(p.fromLabel)}&to=${encodeURIComponent(p.toLabel)}`}
              className="group rounded-lg border border-border bg-background p-4 hover:border-blue-400 hover:bg-muted/30 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 text-sm flex-wrap min-w-0">
                <span className="text-muted-foreground truncate">{p.fromLabel}</span>
                <ArrowRight className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="font-medium truncate">{p.toLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge tone="primary" className="text-[10px]">
                  {p.count} {p.count === 1 ? "movimento" : "movimenti"}
                </Badge>
                {p.sources.map((s) => (
                  <Badge key={s} tone="neutral" className="text-[10px]">
                    {SOURCE_LABELS[s] ?? s}
                  </Badge>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-auto">
                Ultimo cambio: {formatRelative(p.lastChangedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

