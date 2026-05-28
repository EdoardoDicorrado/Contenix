"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { EmployeeFormState } from "./actions";

type Props = {
  action: (
    prev: EmployeeFormState,
    formData: FormData,
  ) => Promise<EmployeeFormState>;
  defaultValues?: {
    firstName: string;
    lastName: string;
    email: string;
    fiscalCode: string;
    role: string;
    hiredAt: string;
    monthlyCost: string;
    active: boolean;
    notes: string;
  };
  submitLabel: string;
};

export function EmployeeForm({ action, defaultValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(
    action,
    null,
  );
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome" error={err("firstName")}>
          <Input name="firstName" defaultValue={defaultValues?.firstName} required />
        </Field>
        <Field label="Cognome" error={err("lastName")}>
          <Input name="lastName" defaultValue={defaultValues?.lastName} required />
        </Field>

        <Field label="Email" error={err("email")} hint="opzionale">
          <Input type="email" name="email" defaultValue={defaultValues?.email} />
        </Field>
        <Field label="Codice fiscale" error={err("fiscalCode")} hint="opzionale">
          <Input
            name="fiscalCode"
            defaultValue={defaultValues?.fiscalCode}
            maxLength={16}
            style={{ textTransform: "uppercase" }}
          />
        </Field>

        <Field label="Ruolo" error={err("role")} hint="opzionale">
          <Input
            name="role"
            defaultValue={defaultValues?.role}
            placeholder="Es. Operaio, Commerciale…"
          />
        </Field>
        <Field label="Data assunzione" error={err("hiredAt")} hint="opzionale">
          <Input type="date" name="hiredAt" defaultValue={defaultValues?.hiredAt} />
        </Field>

        <Field label="Costo mensile (€)" error={err("monthlyCost")} hint="opzionale">
          <Input
            type="number"
            step="0.01"
            min="0"
            name="monthlyCost"
            defaultValue={defaultValues?.monthlyCost}
            placeholder="0,00"
          />
        </Field>
        <Field label="Stato">
          <label className="inline-flex items-center gap-2 h-9 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={defaultValues?.active ?? true}
              className="h-4 w-4 rounded border-input"
            />
            <span>Dipendente attivo</span>
          </label>
        </Field>

        <Field label="Note" error={err("notes")} hint="opzionale" className="sm:col-span-2">
          <Textarea
            name="notes"
            defaultValue={defaultValues?.notes}
            placeholder="Eventuali note interne"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Link href="/dipendenti">
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
