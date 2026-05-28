import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountWizard } from "../account-wizard";

export default function NuovoContoPage() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/conti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Conti
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Nuovo conto</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Crea un nuovo spazio finanziario separato dal conto principale (carta di credito, Revolut, ecc.).
        </p>
      </div>

      <AccountWizard />
    </div>
  );
}
