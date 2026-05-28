import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "../../invoice-form";
import { updateInvoiceAction } from "../../actions";
import { getInvoice } from "@/lib/db/queries/invoices";

export default async function ModificaFatturaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const boundAction = updateInvoiceAction.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href={`/fatture/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna alla fattura
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Modifica fattura</h2>
      </div>

      <InvoiceForm
        action={boundAction}
        defaultValues={{
          number: invoice.number,
          type: invoice.type,
          counterpartyName: invoice.counterpartyName,
          counterpartyVat: invoice.counterpartyVat ?? "",
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
          totalAmount: invoice.totalAmount,
          vatAmount: invoice.vatAmount ?? "",
          currency: invoice.currency,
          status: invoice.status,
          description: invoice.description ?? "",
          paymentIban: invoice.paymentIban ?? "",
          isCreditNote: invoice.isCreditNote,
          relatedInvoiceId: invoice.relatedInvoiceId,
        }}
        submitLabel="Salva modifiche"
        cancelHref={`/fatture/${id}`}
      />
    </div>
  );
}
