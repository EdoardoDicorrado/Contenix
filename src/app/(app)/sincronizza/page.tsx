import Link from "next/link";
import { Tag, Users, FileText, Link2 } from "lucide-react";
import { getMovementsStats } from "@/lib/db/queries/movements";
import { getEmployeeAllocationStats } from "@/lib/db/queries/apply-employee-allocation";
import { getInvoicesStats, getInvoiceMatchStats } from "@/lib/db/queries/invoices";
import {
  SyncCategoriesButton,
  SyncEmployeesButton,
  SyncInvoicesButton,
} from "./sync-buttons";
import { SyncHistoryView } from "./history-view";

/**
 * Pagina /sincronizza diventa "Storico sincronizzazioni".
 *
 * Le sincronizzazioni si avviano dalle pagine di lavoro (/regole, /movimenti,
 * /categorie, /dipendenti) via il bottone "Sincronizza" che apre un overlay.
 * Qui mostriamo solo lo storico dei run, letto da localStorage.
 */
export default async function SincronizzaPage() {
  const [stats, empStats, invStats, invMatchStats] = await Promise.all([
    getMovementsStats(),
    getEmployeeAllocationStats(),
    getInvoicesStats(),
    getInvoiceMatchStats(),
  ]);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Storico sincronizzazioni
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ultime sincronizzazioni eseguite. Le sync si avviano dalle pagine di
            lavoro: il bottone <strong>Sincronizza</strong> in alto a destra apre
            un overlay con la sync rispettiva.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncCategoriesButton stats={stats} label="Sincronizza categorie" />
          <SyncEmployeesButton stats={empStats} label="Sincronizza dipendenti" />
          <SyncInvoicesButton stats={invMatchStats} label="Sincronizza match fatture" />
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCard
          icon={<Tag className="h-4 w-4" />}
          label="Categorie"
          primary={`${stats.categorized}/${stats.total}`}
          subtitle={
            stats.unmatched > 0
              ? `${stats.unmatched} da rivedere`
              : "Tutti categorizzati"
          }
          tone={stats.unmatched > 0 ? "danger" : "success"}
          href="/regole"
          hrefLabel="Vai a Regole"
        />
        <StatusCard
          icon={<Users className="h-4 w-4" />}
          label="Dipendenti"
          primary={`${empStats.allocated}/${empStats.total}`}
          subtitle={
            empStats.unallocated > 0
              ? `${empStats.unallocated} senza dipendente`
              : "Tutti allocati"
          }
          tone={empStats.unallocated > 0 ? "neutral" : "success"}
          href="/dipendenti"
          hrefLabel="Vai a Dipendenti"
        />
        <StatusCard
          icon={<FileText className="h-4 w-4" />}
          label="Fatture"
          primary={`${invStats.paid}/${invStats.total}`}
          subtitle={
            invStats.overdue > 0
              ? `${invStats.overdue} scadute`
              : `${invStats.pending} da pagare`
          }
          tone={invStats.overdue > 0 ? "danger" : "neutral"}
          href="/fatture"
          hrefLabel="Vai a Fatture"
        />
        <StatusCard
          icon={<Link2 className="h-4 w-4" />}
          label="Match fatture"
          primary={`${invMatchStats.fullyMatched}/${invMatchStats.total}`}
          subtitle={
            invMatchStats.unmatched > 0
              ? `${invMatchStats.unmatched} senza match`
              : "Tutte matchate"
          }
          tone={invMatchStats.unmatched > 0 ? "neutral" : "success"}
          href="/fatture"
          hrefLabel="Vai a Fatture"
        />
      </section>

      <SyncHistoryView />
    </div>
  );
}

function StatusCard({
  icon,
  label,
  primary,
  subtitle,
  tone,
  href,
  hrefLabel,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  subtitle: string;
  tone: "success" | "danger" | "neutral";
  href: string;
  hrefLabel: string;
}) {
  const valueColor = {
    success: "text-success",
    danger: "text-danger",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
        {primary}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{subtitle}</span>
        <Link href={href} className="text-foreground hover:underline">
          {hrefLabel} →
        </Link>
      </div>
    </div>
  );
}
