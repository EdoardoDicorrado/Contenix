"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CreditCard,
  Wallet,
  Coins,
  Box,
  Loader2,
  Check,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateAccountAction, type AccountFormState } from "../../actions";

type AccountType = "bank" | "credit_card" | "wallet" | "cash" | "other";

const TYPE_OPTIONS: {
  value: AccountType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "bank", label: "Conto bancario", icon: Banknote },
  { value: "credit_card", label: "Carta di credito", icon: CreditCard },
  { value: "wallet", label: "Wallet", icon: Wallet },
  { value: "cash", label: "Contanti", icon: Coins },
  { value: "other", label: "Altro", icon: Box },
];

const COLOR_PRESETS = [
  "#2563eb", "#16a34a", "#dc2626", "#f97316", "#eab308",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#6b7280",
];

const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF"];

type Props = {
  id: string;
  defaultValues: {
    name: string;
    type: AccountType;
    currency: string;
    color: string;
    identifier: string;
    openingBalance: string;
    notes: string;
    isPrimary: boolean;
    isActive: boolean;
  };
};

export function AccountEditForm({ id, defaultValues }: Props) {
  const boundAction = updateAccountAction.bind(null, id);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    boundAction,
    null,
  );

  const [color, setColor] = useState<string>(defaultValues.color);

  // Successo → la server action fa redirect server-side al dettaglio.
  // Qui gestiamo solo gli errori.

  const err = (k: string) =>
    state && !state.ok ? state.errors?.[k] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="color" value={color} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome del conto" error={err("name")} className="sm:col-span-2">
          <Input
            name="name"
            defaultValue={defaultValues.name}
            required
            maxLength={100}
          />
        </Field>

        <Field label="Tipo" error={err("type")}>
          <Select name="type" defaultValue={defaultValues.type} required>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Valuta" error={err("currency")}>
          <Select name="currency" defaultValue={defaultValues.currency} required>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Identificativo"
          error={err("identifier")}
          hint="ultime 4 cifre / IBAN parziale, opzionale"
        >
          <Input
            name="identifier"
            defaultValue={defaultValues.identifier}
            maxLength={30}
            className="font-mono"
          />
        </Field>

        <Field
          label="Saldo iniziale"
          error={err("openingBalance")}
          hint={`in ${defaultValues.currency}`}
        >
          <Input
            type="number"
            step="0.01"
            name="openingBalance"
            defaultValue={defaultValues.openingBalance}
            className="tabular-nums"
          />
        </Field>

        <Field label="Colore identificativo" className="sm:col-span-2">
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform",
                  color === c
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Colore ${c}`}
              />
            ))}
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              {color}
            </span>
          </div>
        </Field>

        <Field label="Conto principale">
          <label className="inline-flex items-center gap-2 h-9 text-sm">
            <input
              type="checkbox"
              name="isPrimary"
              defaultChecked={defaultValues.isPrimary}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-muted-foreground">
              Marca come conto principale
            </span>
          </label>
        </Field>

        <Field label="Stato">
          <label className="inline-flex items-center gap-2 h-9 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={defaultValues.isActive}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-muted-foreground">Conto attivo</span>
          </label>
        </Field>

        <Field label="Note" hint="opzionale" className="sm:col-span-2">
          <Textarea
            name="notes"
            defaultValue={defaultValues.notes}
            maxLength={2000}
            rows={2}
          />
        </Field>
      </div>

      {state && !state.ok && state.errors._ && (
        <div className="rounded-md border border-danger/30 bg-danger-muted px-3 py-2 text-sm text-danger">
          {state.errors._}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvataggio…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Salva modifiche
            </>
          )}
        </Button>
        <Link href={`/conti/${id}`}>
          <Button type="button" variant="ghost" disabled={pending}>
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
