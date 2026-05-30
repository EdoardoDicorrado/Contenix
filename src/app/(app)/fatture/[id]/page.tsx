import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getInvoice } from "@/lib/db/queries/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteInvoiceAction } from "../actions";
import { MatchesPanel } from "./matches-panel";
import { AiExtractButton } from "./ai-extract-button";

const STATUS_LABEL: Record<string, string> = {
  pending: "Da pagare",
  partial: "Pagamento parziale",
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

const BACK_LINKS: Record<string, { href: string; label: string }> = {
  "da-rivedere": { href: "/fatture/da-rivedere", label: "Torna a Da rivedere" },
  "in-approvazione": {
    href: "/fatture/in-approvazione",
    label: "Torna a In approvazione",
  },
  estere: { href: "/fatture/estere", label: "Torna a Estere" },
  carica: { href: "/fatture/carica", label: "Torna a Carica fatture" },
};

export default async function FatturaDettaglioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; back?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // back: URL relativo preservato (deve iniziare con /fatture per sicurezza).
  // Ha priorità sui BACK_LINKS fissi: serve a tornare all'esatto punto
  // di partenza (es. /fatture?period=month&month=2026-05).
  const safeBack =
    sp.back && sp.back.startsWith("/fatture") ? sp.back : null;
  const back = safeBack
    ? { href: safeBack, label: "Torna indietro" }
    : (BACK_LINKS[sp.from ?? ""] ?? {
        href: "/fatture",
        label: "Torna a Fatture",
      });
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const now = new Date();
  const isOverdue =
    invoice.dueDate &&
    new Date(invoice.dueDate) < now &&
    ["pending", "partial"].includes(invoice.status);
  const displayStatus = isOverdue && invoice.status !== "overdue" ? "overdue" : invoice.status;

  const total = parseFloat(invoice.totalAmount);
  const vat = invoice.vatAmount ? parseFloat(invoice.vatAmount) : null;
  const taxable = vat !== null ? total - vat : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={back.href}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {back.label}
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <div className="flex items-center gap-2.5">
              {invoice.type === "sale" ? (
                <ArrowUpRight className="h-5 w-5 text-success" />
              ) : (
                <ArrowDownLeft className="h-5 w-5 text-danger" />
              )}
              <h2 className="text-2xl font-semibold tracking-tight">
                Fattura {invoice.number}
              </h2>
              <Badge tone={STATUS_TONE[displayStatus]}>{STATUS_LABEL[displayStatus]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {invoice.type === "sale" ? "Vendita" : "Acquisto"} a/da{" "}
              <span className="text-foreground font-medium">{invoice.counterpartyName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/fatture/${invoice.id}/modifica`}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" />
                Modifica
              </Button>
            </Link>
            <form action={deleteInvoiceAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Elimina
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DataPanel title="Dati fattura" className="md:col-span-2">
          <DataRow label="Numero" value={<span className="font-mono">{invoice.number}</span>} />
          <DataRow
            label="Tipo"
            value={invoice.type === "sale" ? "Vendita" : "Acquisto"}
          />
          <DataRow label="Controparte" value={invoice.counterpartyName} />
          {invoice.counterpartyVat && (
            <DataRow
              label="Partita IVA"
              value={<span className="font-mono">{invoice.counterpartyVat}</span>}
            />
          )}
          <DataRow label="Data emissione" value={formatDate(invoice.issueDate)} />
          <DataRow
            label="Scadenza"
            value={
              invoice.dueDate ? (
                <span className={isOverdue ? "text-danger font-medium" : ""}>
                  {formatDate(invoice.dueDate)}
                  {isOverdue && " (scaduta)"}
                </span>
              ) : (
                "—"
              )
            }
          />
          {invoice.documentType && (
            <DataRow
              label="Tipo documento"
              value={<span className="font-mono text-xs">{invoice.documentType}</span>}
            />
          )}
          {invoice.paymentIban && (
            <DataRow
              label="IBAN beneficiario"
              value={<span className="font-mono text-xs">{invoice.paymentIban}</span>}
            />
          )}
          {invoice.paymentMethod && (
            <DataRow
              label="Modalità pagamento"
              value={<span className="font-mono text-xs">{invoice.paymentMethod}</span>}
            />
          )}
        </DataPanel>

        <DataPanel title="Importi">
          {taxable !== null && (
            <DataRow
              label="Imponibile"
              value={
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(taxable)}
                </span>
              }
            />
          )}
          {vat !== null && (
            <DataRow
              label="IVA"
              value={
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(vat)}
                </span>
              }
            />
          )}
          <DataRow
            label="Totale"
            value={
              <span className="tabular-nums font-semibold">
                {formatCurrency(total)} {invoice.currency !== "EUR" && invoice.currency}
              </span>
            }
          />
        </DataPanel>
      </div>

      {invoice.description && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Contenuto fatturato
            </span>
          </div>
          <div className="px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {invoice.description}
          </div>
        </div>
      )}

      {invoice.fileUrl && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              File allegato
            </span>
            {invoice.extractionStatus === "xml" && <Badge tone="success">Letto da XML</Badge>}
            {invoice.extractionStatus === "ai" && <Badge tone="success">Estratto con AI</Badge>}
            {invoice.extractionStatus === "pending_ai" && (
              <Badge tone="primary">
                <Sparkles className="h-3 w-3 inline mr-0.5" /> PDF da estrarre
              </Badge>
            )}
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm truncate">{invoice.fileName}</div>
              <div className="text-[11px] text-muted-foreground">
                {invoice.fileMime ?? "—"}
                {invoice.fileSize ? ` · ${formatBytes(invoice.fileSize)}` : ""}
              </div>
            </div>
            <a
              href={`/api/fatture/${invoice.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Apri / Scarica
              </Button>
            </a>
          </div>
          {invoice.fileMime === "application/pdf" &&
            (invoice.extractionStatus === "pending_ai" || invoice.extractionStatus === "ai") && (
              <div className="px-4 pb-4">
                <AiExtractButton
                  invoiceId={invoice.id}
                  fileSizeBytes={invoice.fileSize}
                  alreadyExtracted={invoice.extractionStatus === "ai"}
                />
              </div>
            )}
        </div>
      )}

      <MatchesPanel invoiceId={invoice.id} invoiceTotal={total} />
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function DataPanel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"rounded-lg border border-border bg-card overflow-hidden " + (className ?? "")}>
      <div className="px-4 py-2.5 border-b border-border bg-muted/40">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
