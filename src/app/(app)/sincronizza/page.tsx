import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
 * Pagina /sincronizza:
 *  - Bottoni di sincronizzazione in alto
 *  - Stato sintetico per area, in stile "lista verticale senza card"
 *    (coerente con drawer di /movimenti)
 *  - Storico run in basso
 */
export default async function SincronizzaPage() {
  const [stats, empStats, invStats, invMatchStats] = await Promise.all([
    getMovementsStats(),
    getEmployeeAllocationStats(),
    getInvoicesStats(),
    getInvoiceMatchStats(),
  ]);

  return (
    <div className="flex flex-col gap-6">
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
          <SyncInvoicesButton
            stats={invMatchStats}
            label="Sincronizza match fatture"
          />
        </div>
      </div>

      <StatusSection
        title="Movimenti"
        href="/movimenti"
        hrefLabel="Vai a Movimenti"
        rows={[
          { label: "Totale movimenti", value: fmtInt(stats.total) },
          {
            label: "Categorizzati",
            value: `${fmtInt(stats.categorized)} / ${fmtInt(stats.total)}`,
            hint: pct(stats.categorized, stats.total),
          },
          {
            label: "Trasferimenti tra conti",
            value: fmtInt(stats.transfers),
            hint: pct(stats.transfers, stats.total),
          },
          {
            label: "Senza categoria",
            value: fmtInt(stats.unmatched),
            loss: stats.unmatched > 0,
            hint:
              stats.unmatched > 0
                ? `${pct(stats.unmatched, stats.total)} da rivedere`
                : "Tutto categorizzato",
          },
        ]}
      />

      <StatusSection
        title="Fatture"
        href="/fatture"
        hrefLabel="Vai a Fatture"
        rows={[
          { label: "Totale fatture", value: fmtInt(invStats.total) },
          {
            label: "Pagate",
            value: `${fmtInt(invStats.paid)} / ${fmtInt(invStats.total)}`,
            hint: pct(invStats.paid, invStats.total),
          },
          {
            label: "Da pagare",
            value: fmtInt(invStats.pending),
            hint:
              invStats.pending > 0
                ? pct(invStats.pending, invStats.total)
                : undefined,
          },
          {
            label: "Scadute",
            value: fmtInt(invStats.overdue),
            loss: invStats.overdue > 0,
            hint:
              invStats.overdue > 0
                ? `${pct(invStats.overdue, invStats.total)} fuori scadenza`
                : "Nessuna scaduta",
          },
        ]}
      />

      <StatusSection
        title="Match fatture ↔ movimenti"
        href="/fatture/in-approvazione"
        hrefLabel="Vai a In approvazione"
        rows={[
          {
            label: "Completamente matchate",
            value: `${fmtInt(invMatchStats.fullyMatched)} / ${fmtInt(invMatchStats.total)}`,
            hint: pct(invMatchStats.fullyMatched, invMatchStats.total),
          },
          {
            label: "Con almeno un match",
            value: fmtInt(invMatchStats.matched),
            hint: pct(invMatchStats.matched, invMatchStats.total),
          },
          {
            label: "Senza alcun match",
            value: fmtInt(invMatchStats.unmatched),
            loss: invMatchStats.unmatched > 0,
            hint:
              invMatchStats.unmatched > 0
                ? `${pct(invMatchStats.unmatched, invMatchStats.total)} da rivedere`
                : "Tutte matchate",
          },
        ]}
      />

      <StatusSection
        title="Dipendenti"
        href="/dipendenti"
        hrefLabel="Vai a Dipendenti"
        rows={[
          { label: "Totale movimenti dipendenti", value: fmtInt(empStats.total) },
          {
            label: "Allocati a dipendente",
            value: `${fmtInt(empStats.allocated)} / ${fmtInt(empStats.total)}`,
            hint: pct(empStats.allocated, empStats.total),
          },
          {
            label: "Senza dipendente",
            value: fmtInt(empStats.unallocated),
            hint:
              empStats.unallocated > 0
                ? pct(empStats.unallocated, empStats.total)
                : "Tutti allocati",
          },
        ]}
      />

      <SyncHistoryView />
    </div>
  );
}

/* ─── Componenti ──────────────────────────────────────────────────────────── */

type StatusRow = {
  label: string;
  value: string;
  hint?: string;
  loss?: boolean;
};

function StatusSection({
  title,
  href,
  hrefLabel,
  rows,
}: {
  title: string;
  href: string;
  hrefLabel: string;
  rows: StatusRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <Link
          href={href}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {hrefLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <StatusStat key={r.label} {...r} />
        ))}
      </div>
    </section>
  );
}

/**
 * Singola riga "label + valore grande". Stesso pattern di YearStat in
 * /movimenti: tutto bianco tranne perdite (loss=true) in rosso.
 */
function StatusStat({ label, value, hint, loss }: StatusRow) {
  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className={
            "text-2xl font-semibold tabular-nums " +
            (loss ? "text-danger" : "text-foreground")
          }
        >
          {value}
        </span>
        {hint && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

function fmtInt(n: number): string {
  return n.toLocaleString("it-IT");
}

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((n / total) * 100).toFixed(0)}%`;
}
