"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import type { MovementFormState } from "./actions";

type Employee = { id: string; firstName: string; lastName: string };
type AccountOption = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "wallet" | "cash" | "other";
  isPrimary: boolean;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: "Banca",
  credit_card: "Carta",
  wallet: "Wallet",
  cash: "Contanti",
  other: "Altro",
};

type Props = {
  action: (
    prev: MovementFormState,
    formData: FormData,
  ) => Promise<MovementFormState>;
  categories: CategoryOption[];
  employees: Employee[];
  accounts: AccountOption[];
  defaultValues?: {
    date: string;
    amount: string;
    type: "income" | "expense";
    description: string;
    categoryId: string | null;
    employeeId: string | null;
    accountId: string | null;
    isTransfer: boolean;
    transferToAccountId: string | null;
  };
  submitLabel: string;
};

export function MovementForm({
  action,
  categories: initialCategories,
  employees,
  accounts,
  defaultValues,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState<MovementFormState, FormData>(
    action,
    null,
  );

  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories);
  const [categoryId, setCategoryId] = useState<string | null>(defaultValues?.categoryId ?? null);
  const [type, setType] = useState<"income" | "expense">(defaultValues?.type ?? "expense");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [accountId, setAccountId] = useState<string>(
    defaultValues?.accountId ??
      accounts.find((a) => a.isPrimary)?.id ??
      accounts[0]?.id ??
      "",
  );
  const [isTransfer, setIsTransfer] = useState(defaultValues?.isTransfer ?? false);
  const [transferToAccountId, setTransferToAccountId] = useState<string>(
    defaultValues?.transferToAccountId ?? "",
  );
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [saveAsTransferRule, setSaveAsTransferRule] = useState(false);

  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  // Suggerisce un pattern dai primi token significativi della descrizione
  function suggestPattern(text: string): string {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-zà-úü0-9\s.@-]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
    return tokens.slice(0, 2).join(" ");
  }
  const suggestedPattern = description ? suggestPattern(description) : "";

  // Conti disponibili come destinazione del trasferimento (esclude quello sorgente)
  const transferTargetAccounts = accounts.filter((a) => a.id !== accountId);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Conto" error={err("accountId")}>
          <Select
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.isPrimary ? "★" : ""} ({ACCOUNT_TYPE_LABEL[a.type]})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tipo" error={err("type")}>
          <Select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as "income" | "expense")}
            required
          >
            <option value="expense">Uscita</option>
            <option value="income">Entrata</option>
          </Select>
        </Field>

        <Field label="Data" error={err("date")}>
          <Input
            type="date"
            name="date"
            defaultValue={defaultValues?.date ?? new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>

        <Field label="Importo (€)" error={err("amount")}>
          <Input
            type="number"
            step="0.01"
            min="0"
            name="amount"
            defaultValue={defaultValues?.amount}
            placeholder="0,00"
            required
          />
        </Field>

        <Field label="Descrizione" error={err("description")} className="sm:col-span-2">
          <Textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. Bonifico cliente, stipendio dipendente, ecc."
            required
          />
        </Field>

        {/* Toggle TRASFERIMENTO TRA CONTI — esclude dal P&L */}
        <div className="sm:col-span-2 rounded-md border border-border bg-card px-3 py-2.5">
          <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="isTransfer"
              checked={isTransfer}
              onChange={(e) => {
                setIsTransfer(e.target.checked);
                if (e.target.checked) setCategoryId(null);
              }}
              className="h-4 w-4 rounded border-input mt-0.5"
            />
            <span className="flex items-center gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">Trasferimento tra conti</span>
              <span className="text-muted-foreground">
                — Non conta nel P&amp;L (es. addebito carta sul conto banca)
              </span>
            </span>
          </label>

          {isTransfer && (
            <div className="mt-3 pl-6 space-y-3">
              <div>
                <Label>Conto di destinazione</Label>
                <Select
                  name="transferToAccountId"
                  value={transferToAccountId}
                  onChange={(e) => setTransferToAccountId(e.target.value)}
                  required={isTransfer}
                >
                  <option value="">— Seleziona conto destinazione —</option>
                  {transferTargetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({ACCOUNT_TYPE_LABEL[a.type]})
                    </option>
                  ))}
                </Select>
                {err("transferToAccountId") && (
                  <p className="text-xs text-danger mt-1">{err("transferToAccountId")}</p>
                )}
              </div>

              {suggestedPattern && (
                <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name="saveAsTransferRule"
                    checked={saveAsTransferRule}
                    onChange={(e) => setSaveAsTransferRule(e.target.checked)}
                    className="h-4 w-4 rounded border-input mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Salva come regola</span>{" "}
                    <span className="text-muted-foreground">
                      — riconosci automaticamente come trasferimento i movimenti futuri con descrizione che contiene{" "}
                    </span>
                    <code className="font-mono text-primary">&quot;{suggestedPattern}&quot;</code>
                  </span>
                </label>
              )}
              {saveAsTransferRule && (
                <div>
                  <Label>Pattern personalizzato</Label>
                  <Input
                    name="transferRulePattern"
                    defaultValue={suggestedPattern}
                    className="font-mono text-xs"
                    maxLength={200}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categoria — nascosta se trasferimento */}
        {!isTransfer && (
          <Field label="Categoria" error={err("categoryId")} hint="opzionale">
            <CategoryCombo
              name="categoryId"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              filterType={type}
              newCategoryType={type}
              onCategoryCreated={(cat) =>
                setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
              }
            />
          </Field>
        )}

        {!isTransfer && (
          <Field label="Dipendente" error={err("employeeId")} hint="opzionale">
            <Select name="employeeId" defaultValue={defaultValues?.employeeId ?? ""}>
              <option value="">— Nessuno —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Salva come regola (categorizzazione) — solo se non trasferimento */}
        {!isTransfer && categoryId && suggestedPattern && (
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
            <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="saveAsRule"
                checked={saveAsRule}
                onChange={(e) => setSaveAsRule(e.target.checked)}
                className="h-4 w-4 rounded border-input mt-0.5"
              />
              <span>
                <span className="font-medium">Salva come regola</span>{" "}
                <span className="text-muted-foreground">
                  — assegna automaticamente questa categoria a movimenti futuri con descrizione che contiene{" "}
                </span>
                <code className="font-mono text-primary">&quot;{suggestedPattern}&quot;</code>
              </span>
            </label>
            {saveAsRule && (
              <div className="mt-2 pl-6">
                <Label>Pattern personalizzato</Label>
                <Input
                  name="rulePattern"
                  defaultValue={suggestedPattern}
                  className="font-mono text-xs"
                  maxLength={200}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Link href="/movimenti">
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
