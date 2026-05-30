import Link from "next/link";
import {
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddLinkButton } from "@/components/ui/add-button";
import {
  ClickableInvoiceRow,
  StopClickCell,
} from "./clickable-invoice-row";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listInvoices,
  getInvoicesStats,
  getInvoiceMatchStats,
  listMonthlyInvoiceAggregates,
  type InvoiceStatus,
  type InvoiceOrigin,
} from "@/lib/db/queries/invoices";
import { SyncInvoicesButton } from "../sincronizza/sync-buttons";
import { periodFromSearchParams, periodToWindow } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteInvoiceAction } from "./actions";
import { FattureFilterBar } from "./filter-bar";
import { FattureMonthlyCards } from "./monthly-cards";

type SP = Promise<{
  type?: string;
  status?: string;
  search?: string;
  origin?: string;
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  year?: string;
  quarter?: string;
}>;

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
  const origin: InvoiceOrigin | undefined =
    sp.origin === "estere" || sp.origin === "cassetto" ? sp.origin : undefined;
  const period = periodFromSearchParams(sp);
  const { from, to } = periodToWindow(period);

  // Mostro la lista solo per "mese specifico". Tutti gli altri periodi mostrano
  // la vista a card mensili filtrata.
  const showInvoiceList = period.kind === "month";
  const extraQs = buildExtraQs({ type, status, search, origin });

  // URL corrente da preservare per il "Torna indietro" della pagina fattura.
  // Include tutti i filtri attivi (period, month, type, ecc.) così al ritorno
  // l'utente vede esattamente lo stato che aveva prima di aprire la fattura.
  const backHref = buildSelfHref(sp);

  const [list, stats, monthlyAggs, matchStats] = await Promise.all([
    showInvoiceList
      ? listInvoices({ type, status, search, from, to, origin })
      : Promise.resolve([] as Awaited<ReturnType<typeof listInvoices>>),
    getInvoicesStats(),
    listMonthlyInvoiceAggregates({ type, status, search, from, to, origin }),
    getInvoiceMatchStats(),
  ]);

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
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
        <div className="flex items-center gap-2 flex-wrap">
          {matchStats.unmatched > 0 && (
            <Link href="/fatture/da-rivedere">
              <Button variant="secondary" className="gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                {matchStats.unmatched} da rivedere
              </Button>
            </Link>
          )}
          <SyncInvoicesButton stats={matchStats} />
          <AddLinkButton label="Nuova fattura" href="/fatture/nuovo" />
        </div>
      </div>

      <FattureFilterBar
        initial={{
          type: type ?? "",
          status: status ?? "",
          search: search ?? "",
          origin: origin ?? "",
          period,
        }}
      />

      {!showInvoiceList ? (
        <FattureMonthlyCards data={monthlyAggs} extraQs={extraQs} />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nessuna fattura in questo periodo"
          description="Cambia mese dalla barra dei filtri o crea una nuova fattura."
          action={
            <AddLinkButton label="Nuova fattura" href="/fatture/nuovo" />
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
                <th className="text-left font-medium px-4 py-2.5">Pagata il</th>
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
                  <ClickableInvoiceRow
                    key={inv.id}
                    invoiceId={inv.id}
                    backHref={backHref}
                  >
                    <td className="px-4 py-3">
                      {inv.type === "sale" ? (
                        <ArrowUpRight className="h-4 w-4 text-success" aria-label="Vendita" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-danger" aria-label="Acquisto" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-foreground">{inv.number}</span>
                        {inv.extractionStatus === "foreign_pdf" && (
                          <Badge tone="neutral" className="font-sans">
                            Estera
                          </Badge>
                        )}
                      </div>
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
                      {inv.paidAt ? (
                        <span className="text-success font-medium">
                          {formatDate(inv.paidAt)}
                        </span>
                      ) : isOverdue ? (
                        <span className="text-danger font-medium">
                          scaduta {formatDate(inv.dueDate!)}
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
                    <StopClickCell className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                    </StopClickCell>
                  </ClickableInvoiceRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Serializza i searchParams della pagina /fatture in un URL relativo. */
function buildSelfHref(sp: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const keys = [
    "type",
    "status",
    "search",
    "origin",
    "period",
    "month",
    "from",
    "to",
    "year",
    "quarter",
  ];
  for (const k of keys) {
    const v = sp[k];
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/fatture?${qs}` : "/fatture";
}

/** Querystring (senza period/month) da preservare nei link mese → dettaglio */
function buildExtraQs(filters: {
  type: "purchase" | "sale" | undefined;
  status: InvoiceStatus | undefined;
  search: string | undefined;
  origin: InvoiceOrigin | undefined;
}): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.origin) params.set("origin", filters.origin);
  return params.toString();
}
