"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AddButton } from "@/components/ui/add-button";
import { CheckToggle } from "@/components/ui/check-toggle";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PushDrawer } from "@/components/ui/push-drawer";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import { cn } from "@/lib/utils";
import { createMovementInlineAction } from "./actions";

type AccountOpt = { id: string; name: string; type: string; isPrimary: boolean };
type EmployeeOpt = { id: string; firstName: string; lastName: string };

const WHITE_BTN_CLASS = cn(
  "inline-flex items-center justify-center gap-2 h-10 rounded-md text-sm font-medium px-4",
  "bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);

export function NewMovementButton({
  categories,
  accounts,
  employees = [],
  defaultAccountId,
}: {
  categories: CategoryOption[];
  accounts: AccountOpt[];
  employees?: EmployeeOpt[];
  defaultAccountId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? "");
  const [localCategories, setLocalCategories] = useState<CategoryOption[]>(categories);
  const [error, setError] = useState<string | null>(null);

  // Opzioni avanzate
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [isTransfer, setIsTransfer] = useState(false);
  const [transferToAccountId, setTransferToAccountId] = useState<string>("");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [rulePattern, setRulePattern] = useState("");

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setType("expense");
    setAmount("");
    setDescription("");
    setCategoryId(null);
    setAccountId(defaultAccountId ?? "");
    setError(null);
    setAdvancedOpen(false);
    setEmployeeId("");
    setIsTransfer(false);
    setTransferToAccountId("");
    setSaveAsRule(false);
    setRulePattern("");
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createMovementInlineAction({
        date,
        amount: amount.replace(",", ".").trim(),
        type,
        description: description.trim(),
        categoryId,
        accountId: accountId || null,
        employeeId: employeeId || null,
        isTransfer,
        transferToAccountId: transferToAccountId || null,
        saveAsRule,
        rulePattern: rulePattern.trim() || description.trim(),
      });
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <AddButton label="Nuovo movimento" onClick={() => setOpen(true)} />

      <PushDrawer
        open={open}
        onClose={() => {
          if (pending) return;
          reset();
          setOpen(false);
        }}
        title="Nuovo movimento"

      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mov-date">Data</Label>
              <Input
                id="mov-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <Label htmlFor="mov-type">Tipo</Label>
              <Select
                id="mov-type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as "income" | "expense");
                  setCategoryId(null);
                }}
                disabled={pending}
              >
                <option value="expense">↓ Uscita</option>
                <option value="income">↑ Entrata</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mov-amount">Importo (€)</Label>
              <Input
                id="mov-amount"
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.,]/g, ""))
                }
                placeholder="0,00"
                disabled={pending}
              />
            </div>
            <div>
              <Label htmlFor="mov-account">Conto</Label>
              <Select
                id="mov-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={pending}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.isPrimary ? "★ " : ""}
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="mov-description">Descrizione</Label>
            <Textarea
              id="mov-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Es. Bonifico Magda Balduzzi stipendio luglio"
              disabled={pending}
              rows={2}
            />
          </div>

          {!isTransfer && (
            <div>
              <Label>Categoria</Label>
              <CategoryCombo
                categories={localCategories}
                value={categoryId}
                onChange={setCategoryId}
                filterType={type}
                onCategoryCreated={(c) =>
                  setLocalCategories((prev) => [...prev, c])
                }
                placeholder="—"
              />
            </div>
          )}

          {/* ─── Opzioni avanzate (collassabili) ─── */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span>Opzioni avanzate</span>
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {advancedOpen && (
              <div className="flex flex-col gap-4 mt-4">
                {/* Dipendente */}
                {!isTransfer && employees.length > 0 && (
                  <div>
                    <Label htmlFor="mov-employee">Dipendente</Label>
                    <Select
                      id="mov-employee"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      disabled={pending}
                    >
                      <option value="">— nessuno —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {/* Trasferimento tra conti */}
                <CheckToggle
                  checked={isTransfer}
                  onChange={(v) => {
                    setIsTransfer(v);
                    if (v) {
                      setCategoryId(null);
                      setEmployeeId("");
                      setSaveAsRule(false);
                    }
                  }}
                  disabled={pending}
                  label="Marca come trasferimento tra conti"
                  description="Esclude il movimento dal P&L economico"
                />

                {isTransfer && (
                  <div>
                    <Label htmlFor="mov-transfer-to">Conto destinazione</Label>
                    <Select
                      id="mov-transfer-to"
                      value={transferToAccountId}
                      onChange={(e) =>
                        setTransferToAccountId(e.target.value)
                      }
                      disabled={pending}
                    >
                      <option value="">— seleziona —</option>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.isPrimary ? "★ " : ""}
                            {a.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                )}

                {/* Salva come regola */}
                {!isTransfer && categoryId && (
                  <CheckToggle
                    checked={saveAsRule}
                    onChange={setSaveAsRule}
                    disabled={pending}
                    label="Salva come regola di categorizzazione"
                    description={
                      saveAsRule
                        ? `Movimenti che contengono "${(rulePattern || description).slice(0, 40) || "…"}" andranno in questa categoria`
                        : "Applica automaticamente questa categoria ai movimenti simili"
                    }
                  />
                )}

                {saveAsRule && !isTransfer && categoryId && (
                  <div>
                    <Label htmlFor="mov-rule-pattern">
                      Pattern regola{" "}
                      <span className="text-muted-foreground font-normal">
                        (default: descrizione)
                      </span>
                    </Label>
                    <Input
                      id="mov-rule-pattern"
                      type="text"
                      value={rulePattern}
                      onChange={(e) => setRulePattern(e.target.value)}
                      placeholder={description || "es. ANTHROPIC"}
                      disabled={pending}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          <div className="pt-3 border-t border-border">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                !description.trim() ||
                !amount ||
                pending ||
                (isTransfer && !transferToAccountId)
              }
              className={WHITE_BTN_CLASS + " w-full"}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crea movimento
            </button>
          </div>
        </div>
      </PushDrawer>
    </>
  );
}
