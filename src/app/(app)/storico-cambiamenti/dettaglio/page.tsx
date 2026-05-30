import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Calendar, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listChangesForPair } from "@/lib/db/queries/category-change-log";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  sync: "Sincronizzazione",
  inline: "Modifica al volo",
  manual: "Form modifica",
  bulk: "Bulk Da rivedere",
  "rule-new": "Nuova regola",
  import: "Import",
};

type SP = Promise<{ from?: string; to?: string }>;

export default async function DettaglioCambiamentiPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const from = sp.from;
  const to = sp.to;
  if (!from || !to) notFound();

  const rows = await listChangesForPair(from, to);
  const totalAmount = rows.reduce((s, r) => s + Math.abs(parseFloat(r.amount)), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/storico-cambiamenti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Tutti i cambiamenti
        </Link>
        <div className="flex items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">{from}</span>
              <ArrowRight className="h-5 w-5 text-blue-600" />
              <span>{to}</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length} {rows.length === 1 ? "movimento" : "movimenti"} spostati ·
              totale movimentato{" "}
              <span className="font-medium text-foreground">{formatCurrency(totalAmount)}</span>
            </p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-12 text-center text-sm text-muted-foreground">
          Nessun movimento per questa coppia.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-24">Data movim.</th>
                <th className="text-left px-3 py-2 font-medium">Descrizione</th>
                <th className="text-left px-3 py-2 font-medium w-28">Conto</th>
                <th className="text-right px-3 py-2 font-medium w-24">Importo</th>
                <th className="text-left px-3 py-2 font-medium w-32">Sorgente</th>
                <th className="text-left px-3 py-2 font-medium w-28">Cambiato</th>
                <th className="px-2 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {formatDate(r.date)}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-pre-wrap break-words">
                    {r.description}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                    {r.accountName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">
                    {formatCurrency(parseFloat(r.amount))}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone="neutral" className="text-[10px]">
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatRelative(r.changedAt, true)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/movimenti/${r.movementId}/modifica`}>
                      <Button variant="ghost" size="icon" aria-label="Modifica movimento">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

