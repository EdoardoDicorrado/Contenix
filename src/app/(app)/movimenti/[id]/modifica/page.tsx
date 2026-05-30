import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MovementForm } from "../../movement-form";
import { updateMovementAction } from "../../actions";
import { getMovement } from "@/lib/db/queries/movements";
import { listCategories } from "@/lib/db/queries/categories";
import { listEmployees } from "@/lib/db/queries/employees";
import { listAccounts } from "@/lib/db/queries/financial-accounts";

export default async function ModificaMovimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [movement, categories, employees, accounts] = await Promise.all([
    getMovement(id),
    listCategories(),
    listEmployees(false),
    listAccounts({ activeOnly: false }),
  ]);

  if (!movement) notFound();

  const boundAction = updateMovementAction.bind(null, id);

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
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Modifica movimento</h2>
      </div>

      <MovementForm
        action={boundAction}
        categories={categories}
        employees={employees}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          isPrimary: a.isPrimary,
        }))}
        defaultValues={{
          date: movement.date.toISOString().slice(0, 10),
          amount: parseFloat(movement.amount).toString(),
          type: movement.type,
          description: movement.description,
          categoryId: movement.categoryId,
          employeeId: movement.employeeId,
          accountId: movement.accountId,
          isTransfer: movement.isTransfer,
          transferToAccountId: movement.transferToAccountId,
        }}
        submitLabel="Salva modifiche"
      />
    </div>
  );
}
