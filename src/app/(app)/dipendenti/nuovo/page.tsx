import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm } from "../employee-form";
import { createEmployeeAction } from "../actions";

export default function NuovoDipendentePage() {
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
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Nuovo dipendente</h2>
      </div>

      <EmployeeForm action={createEmployeeAction} submitLabel="Crea dipendente" />
    </div>
  );
}
