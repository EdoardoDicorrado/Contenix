import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { NewEmployeeButton } from "./new-employee-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listEmployeesWithStats } from "@/lib/db/queries/employees";
import { getEmployeeAllocationStats } from "@/lib/db/queries/apply-employee-allocation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteEmployeeAction } from "./actions";
import { SyncEmployeesButton } from "../sincronizza/sync-buttons";

export default async function DipendentiPage() {
  const [rows, empStats] = await Promise.all([
    listEmployeesWithStats(),
    getEmployeeAllocationStats(),
  ]);

  const totalMonthlyCost = rows
    .filter((r) => r.active)
    .reduce((sum, r) => sum + parseFloat(r.monthlyCost ?? "0"), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dipendenti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} {rows.length === 1 ? "dipendente" : "dipendenti"} ·
            Costo mensile attivi: <span className="text-danger font-medium">{formatCurrency(totalMonthlyCost)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncEmployeesButton stats={empStats} />
          <NewEmployeeButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nessun dipendente"
          description="Aggiungi i dipendenti per tracciare costi mensili e ricavi che portano."
          action={<NewEmployeeButton />}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Nome</th>
                <th className="text-left font-medium px-4 py-2.5">Ruolo</th>
                <th className="text-left font-medium px-4 py-2.5">Assunto il</th>
                <th className="text-right font-medium px-4 py-2.5">Costo mese</th>
                <th className="text-right font-medium px-4 py-2.5">Ricavi portati</th>
                <th className="text-center font-medium px-4 py-2.5">Stato</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => {
                const cost = parseFloat(e.monthlyCost ?? "0");
                const rev = parseFloat(e.revenue);
                return (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">
                      {e.lastName} {e.firstName}
                      {e.email && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {e.email}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.role ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {e.hiredAt ? formatDate(e.hiredAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-danger">
                      {cost > 0 ? formatCurrency(cost) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-success">
                      {rev > 0 ? formatCurrency(rev) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.active ? (
                        <Badge tone="success">Attivo</Badge>
                      ) : (
                        <Badge tone="neutral">Inattivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/dipendenti/${e.id}/modifica`}>
                          <Button variant="ghost" size="icon" aria-label="Modifica">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <form action={deleteEmployeeAction}>
                          <input type="hidden" name="id" value={e.id} />
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
