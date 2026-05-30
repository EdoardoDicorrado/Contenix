import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "../invoice-form";
import { createInvoiceAction } from "../actions";

export default function NuovaFatturaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/fatture"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Fatture
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Nuova fattura</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Inserimento manuale. Il modulo di upload PDF/XML con AI arriverà prossimamente.
        </p>
      </div>

      <InvoiceForm
        action={createInvoiceAction}
        submitLabel="Crea fattura"
        cancelHref="/fatture"
      />
    </div>
  );
}
