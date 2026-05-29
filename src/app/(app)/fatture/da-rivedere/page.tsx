import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listInvoicesToReview } from "@/lib/db/queries/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AbbinaButton } from "./abbina-button";

export default async function FattureDaRivederePage() {
  const rows = await listInvoicesToReview();
  const now = new Date();

  // Conteggi rapidi per il sommario in alto
  const totalsByKind = rows.reduce(
    (acc, r) => {
      const matched = parseFloat(r.matchedAmount);
      if (matched === 0) acc.zero += 1;
      else acc.partial += 1;
      return acc;
    },
    { zero: 0, partial: 0 },
  );

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/fatture"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Fatture
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">
          Fatture da rivedere
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fatture senza match con un movimento o con pagamento parziale. Apri la
          singola fattura per gestire i match manualmente — i suggerimenti
          deboli sono nel pannello &quot;Match suggeriti&quot;.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna fattura da rivedere"
          description="Tutte le fatture hanno un match completo con i movimenti."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {rows.length}
              </span>{" "}
              fatture totali
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {totalsByKind.zero}
              </span>{" "}
              senza match
            </span>
            {totalsByKind.partial > 0 && (
              <>
                <span>·</span>
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {totalsByKind.partial}
                  </span>{" "}
                  con match parziale
                </span>
              </>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5 w-8"></th>
                  <th className="text-left font-medium px-4 py-2.5">Numero</th>
                  <th className="text-left font-medium px-4 py-2.5">Controparte</th>
                  <th className="text-left font-medium px-4 py-2.5">Emessa</th>
                  <th className="text-left font-medium px-4 py-2.5">Scadenza</th>
                  <th className="text-right font-medium px-4 py-2.5">Totale</th>
                  <th className="text-right font-medium px-4 py-2.5">Matchato</th>
                  <th className="text-right font-medium px-4 py-2.5">Restante</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((inv) => {
                  const total = parseFloat(inv.totalAmount);
                  const matched = parseFloat(inv.matchedAmount);
                  const remaining = total - matched;
                  const isOverdue =
                    inv.dueDate && new Date(inv.dueDate) < now;
                  const partialPct =
                    matched > 0 ? Math.round((matched / total) * 100) : 0;

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {inv.type === "sale" ? (
                          <ArrowUpRight
                            className="h-4 w-4 text-success"
                            aria-label="Vendita"
                          />
                        ) : (
                          <ArrowDownLeft
                            className="h-4 w-4 text-danger"
                            aria-label="Acquisto"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/fatture/${inv.id}`}
                          className="text-foreground hover:underline"
                        >
                          {inv.number}
                        </Link>
                        {inv.isCreditNote && (
                          <Badge tone="neutral" className="ml-1.5">
                            NC
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div className="font-medium">{inv.counterpartyName}</div>
                        {inv.counterpartyVat && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {inv.counterpartyVat}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {inv.dueDate ? (
                          <span
                            className={
                              isOverdue ? "text-danger font-medium" : "text-muted-foreground"
                            }
                          >
                            {formatDate(inv.dueDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(total)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {matched > 0 ? (
                          <span className="text-foreground">
                            {formatCurrency(matched)}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({partialPct}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-danger">
                        {formatCurrency(remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <AbbinaButton
                            invoiceId={inv.id}
                            invoiceNumber={inv.number}
                            invoiceType={inv.type}
                            counterparty={inv.counterpartyName}
                            totalAmount={inv.totalAmount}
                            remainingAmount={remaining}
                          />
                          <Link
                            href={`/fatture/${inv.id}`}
                            className="inline-flex items-center justify-center h-7 px-2 rounded-md text-xs text-foreground hover:bg-muted transition-colors gap-1"
                            title="Apri la fattura"
                          >
                            Apri
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
