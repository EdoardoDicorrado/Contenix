"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, AlertCircle, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import { createMovementInlineAction } from "./actions";

type AccountOpt = { id: string; name: string; type: string; isPrimary: boolean };

export function NewMovementButton({
  categories,
  accounts,
  defaultAccountId,
}: {
  categories: CategoryOption[];
  accounts: AccountOpt[];
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

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setType("expense");
    setAmount("");
    setDescription("");
    setCategoryId(null);
    setAccountId(defaultAccountId ?? "");
    setError(null);
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
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Nuovo movimento
      </Button>

      {open && (
        <OverlayModal
          title="Nuovo movimento"
          icon={<ArrowLeftRight className="h-4 w-4 text-blue-600" />}
          onClose={() => {
            if (!pending) {
              reset();
              setOpen(false);
            }
          }}
          size="md"
        >
          <div className="flex flex-col gap-4">
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
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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

            <div>
              <Label>Categoria</Label>
              <CategoryCombo
                categories={localCategories}
                value={categoryId}
                onChange={setCategoryId}
                filterType={type}
                onCategoryCreated={(c) => setLocalCategories((prev) => [...prev, c])}
                placeholder="—"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <Link
                href="/movimenti/nuovo"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setOpen(false)}
              >
                Opzioni avanzate (trasferimenti, dipendenti, regole)
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  disabled={pending}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!description.trim() || !amount || pending}
                  className="gap-2"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Crea movimento
                </Button>
              </div>
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}
