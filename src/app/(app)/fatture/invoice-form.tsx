"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { InvoiceFormState } from "./actions";

type Props = {
  action: (
    prev: InvoiceFormState,
    formData: FormData,
  ) => Promise<InvoiceFormState>;
  defaultValues?: {
    number: string;
    type: "purchase" | "sale";
    counterpartyName: string;
    counterpartyVat: string;
    issueDate: string;
    dueDate: string;
    totalAmount: string;
    vatAmount: string;
    currency: string;
    status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
    description?: string;
    paymentIban?: string;
    isCreditNote?: boolean;
    relatedInvoiceId?: string | null;
  };
  submitLabel: string;
  cancelHref: string;
};

export function InvoiceForm({ action, defaultValues, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState<InvoiceFormState, FormData>(
    action,
    null,
  );
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tipo" error={err("type")}>
          <Select name="type" defaultValue={defaultValues?.type ?? "purchase"} required>
            <option value="purchase">Acquisto</option>
            <option value="sale">Vendita</option>
          </Select>
        </Field>
        <Field label="Numero fattura" error={err("number")}>
          <Input
            name="number"
            defaultValue={defaultValues?.number}
            placeholder="Es. 2026/042"
            required
          />
        </Field>

        <Field label="Nota di credito" className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 h-9 text-sm">
            <input
              type="checkbox"
              name="isCreditNote"
              defaultChecked={defaultValues?.isCreditNote ?? false}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-muted-foreground">
              È una nota di credito (storno di una fattura emessa)
            </span>
          </label>
        </Field>

        <Field label="Controparte" error={err("counterpartyName")} className="sm:col-span-2">
          <Input
            name="counterpartyName"
            defaultValue={defaultValues?.counterpartyName}
            placeholder="Es. Rossi SRL"
            required
          />
        </Field>

        <Field label="Partita IVA" error={err("counterpartyVat")} hint="opzionale">
          <Input
            name="counterpartyVat"
            defaultValue={defaultValues?.counterpartyVat}
            maxLength={20}
            style={{ textTransform: "uppercase" }}
            placeholder="IT12345678901"
          />
        </Field>
        <Field label="Stato" error={err("status")}>
          <Select name="status" defaultValue={defaultValues?.status ?? "pending"} required>
            <option value="pending">Da pagare</option>
            <option value="partial">Pagamento parziale</option>
            <option value="paid">Pagata</option>
            <option value="overdue">Scaduta</option>
            <option value="cancelled">Annullata</option>
          </Select>
        </Field>

        <Field label="Data emissione" error={err("issueDate")}>
          <Input
            type="date"
            name="issueDate"
            defaultValue={defaultValues?.issueDate ?? new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>
        <Field label="Scadenza" error={err("dueDate")} hint="opzionale">
          <Input type="date" name="dueDate" defaultValue={defaultValues?.dueDate} />
        </Field>

        <Field label="Importo totale (€)" error={err("totalAmount")}>
          <Input
            type="number"
            step="0.01"
            min="0"
            name="totalAmount"
            defaultValue={defaultValues?.totalAmount}
            placeholder="0,00"
            required
          />
        </Field>
        <Field label="IVA (€)" error={err("vatAmount")} hint="opzionale">
          <Input
            type="number"
            step="0.01"
            min="0"
            name="vatAmount"
            defaultValue={defaultValues?.vatAmount}
            placeholder="0,00"
          />
        </Field>

        <Field label="Valuta" error={err("currency")}>
          <Select name="currency" defaultValue={defaultValues?.currency ?? "EUR"}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="CHF">CHF</option>
          </Select>
        </Field>

        <Field
          label="IBAN beneficiario"
          error={err("paymentIban")}
          hint="opzionale — utile per match"
        >
          <Input
            name="paymentIban"
            defaultValue={defaultValues?.paymentIban}
            maxLength={34}
            placeholder="IT00X0000000000000000000000"
            className="font-mono uppercase"
          />
        </Field>

        <Field
          label="Descrizione contenuto"
          error={err("description")}
          hint="opzionale"
          className="sm:col-span-2"
        >
          <Textarea
            name="description"
            defaultValue={defaultValues?.description}
            placeholder="Es. Realizzazione landing page e campagna Ads · Configurazione hosting"
            maxLength={2000}
            rows={3}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Link href={cancelHref}>
          <Button type="button" variant="ghost">
            Annulla
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
