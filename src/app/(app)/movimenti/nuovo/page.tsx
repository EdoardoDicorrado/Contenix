import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MovementForm } from "../movement-form";
import { createMovementAction } from "../actions";
import { listCategories } from "@/lib/db/queries/categories";
import { listEmployees } from "@/lib/db/queries/employees";
import { listAccounts } from "@/lib/db/queries/financial-accounts";

export default async function NuovoMovimentoPage() {
  const [categories, employees, accounts] = await Promise.all([
    listCategories(),
    listEmployees(true),
    listAccounts({ activeOnly: true }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/movimenti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Movimenti
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Nuovo movimento</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registra una nuova entrata o uscita
        </p>
      </div>

      <MovementForm
        action={createMovementAction}
        categories={categories}
        employees={employees}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          isPrimary: a.isPrimary,
        }))}
        submitLabel="Crea movimento"
      />
    </div>
  );
}
