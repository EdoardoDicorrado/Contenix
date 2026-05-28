import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm } from "../../employee-form";
import { updateEmployeeAction } from "../../actions";
import { getEmployee } from "@/lib/db/queries/employees";

export default async function ModificaDipendentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const boundAction = updateEmployeeAction.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/dipendenti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Dipendenti
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">
          Modifica dipendente
        </h2>
      </div>

      <EmployeeForm
        action={boundAction}
        defaultValues={{
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email ?? "",
          fiscalCode: employee.fiscalCode ?? "",
          role: employee.role ?? "",
          hiredAt: employee.hiredAt
            ? employee.hiredAt.toISOString().slice(0, 10)
            : "",
          monthlyCost: employee.monthlyCost ?? "",
          active: employee.active,
          notes: employee.notes ?? "",
        }}
        submitLabel="Salva modifiche"
      />
    </div>
  );
}
