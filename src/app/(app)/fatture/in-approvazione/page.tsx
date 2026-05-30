import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { listPendingApprovalsAction } from "./approval-actions";
import { ApprovalsView } from "./approvals-view";

export default async function FattureInApprovazionePage() {
  const pending = await listPendingApprovalsAction();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/fatture"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna a Fatture
      </Link>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Match in approvazione
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suggerimenti automatici fattura ↔ movimento in attesa di
          conferma. Esamina ognuno e approva, rifiuta o cambia il movimento
          collegato.
        </p>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          title="Nessun match in attesa"
          description="Quando il motore proporrà nuovi abbinamenti, li troverai qui per la tua approvazione."
        />
      ) : (
        <ApprovalsView pending={pending} />
      )}
    </div>
  );
}
