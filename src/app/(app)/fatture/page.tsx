import Link from "next/link";
import { Plus, Pencil, Trash2, FileText, ArrowUpRight, ArrowDownLeft, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listInvoices, getInvoicesStats, type InvoiceStatus } from "@/lib/db/queries/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteInvoiceAction } from "./actions";
import { FattureFilterBar } from "./filter-bar";

type SP = Promise<{ type?: string; status?: string; search?: string }>;

const STATUS_LABEL: Record<string, string> = {
  pending: "Da pagare",
  partial: "Parziale",
  paid: "Pagata",
  overdue: "Scaduta",
  cancelled: "Annullata",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "danger" | "primary"> = {
  pending: "neutral",
  partial: "primary",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};

export default async function FatturePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const type = sp.type === "purchase" || sp.type === "sale" ? sp.type : undefined;
  const validStatuses: InvoiceStatus[] = ["pending", "partial", "paid", "overdue", "cancelled"];
  const status =
    sp.status && validStatuses.includes(sp.status as InvoiceStatus)
      ? (sp.status as InvoiceStatus)
      : undefined;
  const search = sp.search || undefined;

  const [list, stats] = await Promise.all([
    listInvoices({ type, status, search }),
    getInvoicesStats(),
  ]);

  const now = new Date();

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Fatture</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total} totali · {stats.paid} pagate ·{" "}
            <span className="text-danger">{stats.overdue} scadute</span> ·{" "}
            da incassare/pagare{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(parseFloat(stats.totalPendingAmount))}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/fatture/carica">
            <Button variant="secondary">
              <FileCode className="h-4 w-4" />
              Carica file
            </Button>
          </Link>
          <Link href="/fatture/nuovo">
            <Button>
              <Plus className="h-4 w-4" />
              Nuova fattura
            </Button>
          </Link>
        </div>
      </div>

      <FattureFilterBar
        initial={{
          type: type ?? "",
          status: status ?? "",
          search: search ?? "",
        }}
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nessuna fattura"
          description="Inizia inserendo manualmente una fattura o aspetta il modulo di upload PDF/XML (prossimo step)."
          action={
            <Link href="/fatture/nuovo">
              <Button>
                <Plus className="h-4 w-4" />
                Nuova fattura
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
                <th className="text-left font-medium px-4 py-2.5">Scadenza</th>
                <th className="text-right font-medium px-4 py-2.5">Totale</th>
                <th className="text-center font-medium px-4 py-2.5">Stato</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((inv) => {
                const isOverdue =
                  inv.dueDate &&
                  new Date(inv.dueDate) < now &&
                  ["pending", "partial"].includes(inv.status);
                const displayStatus = isOverdue && inv.status !== "overdue" ? "overdue" : inv.status;

                return (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {inv.type === "sale" ? (
                        <ArrowUpRight className="h-4 w-4 text-success" aria-label="Vendita" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-danger" aria-label="Acquisto" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/fatture/${inv.id}`}
                        className="text-foreground hover:text-primary"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <div className="font-medium">{inv.counterpartyName}</div>
                      {inv.counterpartyVat && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {inv.counterpartyVat}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatDate(inv.issueDate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {inv.dueDate ? (
                        <span className={isOverdue ? "text-danger font-medium" : "text-muted-foreground"}>
                          {formatDate(inv.dueDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(parseFloat(inv.totalAmount))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={STATUS_TONE[displayStatus]}>
                        {STATUS_LABEL[displayStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/fatture/${inv.id}`}>
                          <Button variant="ghost" size="icon" aria-label="Apri">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link href={`/fatture/${inv.id}/modifica`}>
                          <Button variant="ghost" size="icon" aria-label="Modifica">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <form action={deleteInvoiceAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="submit"
                            aria-label="Elimina"
                            className="text-danger hover:bg-danger/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
