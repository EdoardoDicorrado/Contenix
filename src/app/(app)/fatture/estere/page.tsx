import Link from "next/link";
import {
  Plus,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listForeignInvoices } from "@/lib/db/queries/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Da pagare",
  partial: "Parziale",
  paid: "Pagata",
  overdue: "Scaduta",
  cancelled: "Annullata",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "danger" | "primary"> =
  {
    pending: "neutral",
    partial: "primary",
    paid: "success",
    overdue: "danger",
    cancelled: "neutral",
  };

/**
 * Sotto-pagina "Estere": elenco delle fatture estere caricate (PDF).
 * Bottone "Esporta ZIP" che restituisce un ZIP con tutti i PDF allegati
 * + un riepilogo CSV.
 */
export default async function FattureEsterePage() {
  const rows = await listForeignInvoices();
  const withFile = rows.filter((r) => !!r.fileUrl);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Fatture estere
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Fatture non FatturaPA (estere o cartacee) caricate come PDF. Solo
            queste finiscono qui — il cassetto fiscale resta in /fatture.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {withFile.length > 0 && (
            <a
              href="/api/fatture/estere/zip"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
              title={`Esporta ${withFile.length} PDF + riepilogo CSV in un unico ZIP`}
            >
              <Download className="h-4 w-4" />
              Esporta ZIP ({withFile.length})
            </a>
          )}
          <Link href="/fatture/carica/estero">
            <Button>
              <Plus className="h-4 w-4" />
              Carica estere
            </Button>
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna fattura estera"
          description="Carica i PDF di fatture estere o cartacee da Importa fatture → Fatture estere."
          action={
            <Link href="/fatture/carica/estero">
              <Button>
                <Plus className="h-4 w-4" />
                Carica estere
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 w-8"></th>
                <th className="text-left font-medium px-4 py-2.5">Numero</th>
                <th className="text-left font-medium px-4 py-2.5">Controparte</th>
                <th className="text-left font-medium px-4 py-2.5">Emessa</th>
                <th className="text-right font-medium px-4 py-2.5">Totale</th>
                <th className="text-center font-medium px-4 py-2.5">Stato</th>
                <th className="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    {inv.type === "sale" ? (
                      <ArrowUpRight
                        className="h-4 w-4 text-success"
                        aria-label="Emessa"
                      />
                    ) : (
                      <ArrowDownLeft
                        className="h-4 w-4 text-danger"
                        aria-label="Ricevuta"
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
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium break-words">
                      {inv.counterpartyName}
                    </div>
                    {inv.counterpartyVat && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {inv.counterpartyVat}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(inv.issueDate)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(parseFloat(inv.totalAmount))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_TONE[inv.status]}>
                      {STATUS_LABEL[inv.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {inv.fileUrl && (
                        <a
                          href={`/api/fatture/${inv.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          title={`Apri PDF ${inv.fileName ?? ""}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Link
                        href={`/fatture/${inv.id}`}
                        className="inline-flex items-center justify-center h-7 px-2 rounded-md text-xs text-foreground hover:bg-muted"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Apri
                      </Link>
                    </div>
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
