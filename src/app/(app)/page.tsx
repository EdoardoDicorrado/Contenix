import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardValue,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { listMovements, getMonthlyKpi } from "@/lib/db/queries/movements";
import { getMonthlyInvoiceKpi } from "@/lib/db/queries/invoices";

const MONTH_LABEL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const [kpi, invoiceKpi, recent] = await Promise.all([
    getMonthlyKpi(year, month),
    getMonthlyInvoiceKpi(year, month),
    listMovements().then((r) => r.slice(0, 5)),
  ]);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Panoramica</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {MONTH_LABEL[month - 1]} {year}
          </p>
        </div>
        <Link href="/movimenti/nuovo">
          <Button>
            <Plus className="h-4 w-4" />
            Nuovo movimento
          </Button>
        </Link>
      </div>

      {/* Movimenti bancari */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Movimenti bancari
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="Entrate del mese"
            value={formatCurrency(kpi.entrate)}
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            tone="success"
          />
          <KpiCard
            title="Uscite del mese"
            value={formatCurrency(kpi.uscite)}
            icon={<TrendingDown className="h-4 w-4 text-danger" />}
            tone="danger"
          />
          <KpiCard
            title="Saldo netto"
            value={formatCurrency(kpi.saldo)}
            icon={<Wallet className="h-4 w-4 text-foreground" />}
            tone={kpi.saldo >= 0 ? "success" : "danger"}
            delta={`${kpi.count} ${kpi.count === 1 ? "movimento" : "movimenti"}`}
          />
        </div>
      </section>

      {/* Fatture */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Fatture
          </h3>
          <Link href="/fatture" className="text-xs text-primary hover:underline">
            Vedi tutte →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Fatturato del mese"
            value={formatCurrency(invoiceKpi.revenue)}
            icon={<ArrowUpRight className="h-4 w-4 text-success" />}
            tone="success"
            delta={`${invoiceKpi.revenueCount} ${invoiceKpi.revenueCount === 1 ? "fattura emessa" : "fatture emesse"}`}
          />
          <KpiCard
            title="Acquisti del mese"
            value={formatCurrency(invoiceKpi.cost)}
            icon={<ArrowDownLeft className="h-4 w-4 text-danger" />}
            tone="danger"
            delta={`${invoiceKpi.costCount} ${invoiceKpi.costCount === 1 ? "fattura ricevuta" : "fatture ricevute"}`}
          />
          <KpiCard
            title="Da incassare"
            value={formatCurrency(invoiceKpi.receivables)}
            icon={<FileText className="h-4 w-4 text-foreground" />}
            tone={invoiceKpi.receivablesOverdue > 0 ? "danger" : "neutral"}
            delta={
              invoiceKpi.receivablesOverdue > 0
                ? `${formatCurrency(invoiceKpi.receivablesOverdue)} già scaduto`
                : `${invoiceKpi.receivablesCount} ${invoiceKpi.receivablesCount === 1 ? "fattura" : "fatture"}`
            }
          />
          <KpiCard
            title="Da pagare"
            value={formatCurrency(invoiceKpi.payables)}
            icon={<FileText className="h-4 w-4 text-foreground" />}
            tone={invoiceKpi.payablesOverdue > 0 ? "danger" : "neutral"}
            delta={
              invoiceKpi.payablesOverdue > 0
                ? `${formatCurrency(invoiceKpi.payablesOverdue)} già scaduto`
                : `${invoiceKpi.payablesCount} ${invoiceKpi.payablesCount === 1 ? "fattura" : "fatture"}`
            }
          />
        </div>

        {(invoiceKpi.receivablesOverdue > 0 || invoiceKpi.payablesOverdue > 0) && (
          <div className="rounded-md border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-foreground">Attenzione: fatture scadute non pagate.</span>{" "}
              <Link href="/fatture?status=overdue" className="text-primary hover:underline">
                Apri elenco scadute →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Movimenti recenti */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Movimenti recenti</CardTitle>
            <Link href="/movimenti" className="text-xs text-primary hover:underline">
              Vedi tutti →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nessun movimento registrato. Inizia da{" "}
              <Link href="/movimenti/nuovo" className="text-primary hover:underline">
                Nuovo movimento
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((m) => {
                const isIncome = m.type === "income";
                const amount = parseFloat(m.amount);
                return (
                  <li key={m.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm text-foreground truncate">
                        {m.description}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.date)}
                        {m.categoryName && ` · ${m.categoryName}`}
                      </span>
                    </div>
                    <span
                      className={
                        "text-sm font-medium tabular-nums shrink-0 " +
                        (isIncome ? "text-success" : "text-danger")
                      }
                    >
                      {isIncome ? "+" : "−"}
                      {formatCurrency(amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone,
  delta,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "success" | "danger" | "neutral";
  delta?: string;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-muted-foreground";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {icon}
        </div>
        <CardValue>{value}</CardValue>
      </CardHeader>
      {delta && (
        <CardFooter>
          <span className={toneClass}>{delta}</span>
        </CardFooter>
      )}
    </Card>
  );
}
