import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Users, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMovementsStats } from "@/lib/db/queries/movements";
import { getEmployeeAllocationStats } from "@/lib/db/queries/apply-employee-allocation";
import { SyncStatusCard } from "./sync-status-card";
import { EmployeeSyncCard } from "./employee-sync-card";

export default async function SincronizzaPage() {
  const [stats, empStats] = await Promise.all([
    getMovementsStats(),
    getEmployeeAllocationStats(),
  ]);
  const totalUnmatched = stats.unmatched;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Sincronizza</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Applica le{" "}
            <Link href="/regole" className="text-blue-700 hover:underline">
              regole
            </Link>{" "}
            ai movimenti esistenti. Le righe senza match vengono spostate nella
            categoria &quot;Da rivedere&quot; per essere gestite a mano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalUnmatched > 0 ? (
            <Badge tone="neutral" className="gap-1">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              {totalUnmatched} da rivedere
            </Badge>
          ) : (
            <Badge tone="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Tutti categorizzati
            </Badge>
          )}
        </div>
      </div>

      {/* Stato sincronizzazione categorie */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-blue-600" />
          Categorie (via regole)
        </h3>
        <SyncStatusCard stats={stats} />
      </section>

      {/* Allocazione dipendenti */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          Dipendenti (match nome+cognome nella descrizione)
        </h3>
        <EmployeeSyncCard stats={empStats} />
      </section>

      {/* Card link a "Da rivedere" */}
      <section className="flex flex-col gap-2">
        <div className="rounded-lg border border-border bg-background p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-10 w-10 rounded-md flex items-center justify-center shrink-0 ${
                totalUnmatched > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
              }`}
            >
              {totalUnmatched > 0 ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {totalUnmatched > 0
                  ? `${totalUnmatched} ${totalUnmatched === 1 ? "movimento" : "movimenti"} da rivedere`
                  : "Tutti i movimenti hanno una categoria"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {totalUnmatched > 0
                  ? `Senza categoria o in "Da rivedere". Aprili per categorizzarli in bulk o creare nuove regole.`
                  : `Lavoro fatto. Riapplica solo se aggiungi nuove regole.`}
              </div>
            </div>
          </div>
          {totalUnmatched > 0 && (
            <Link href="/movimenti/da-rivedere" className="shrink-0">
              <Button className="gap-2">
                Vai alla pagina
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
