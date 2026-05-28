"use client";

import { useActionState, useState } from "react";
import {
  Banknote,
  CreditCard,
  Wallet,
  Coins,
  Box,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createAccountAction, type AccountFormState } from "./actions";

type AccountType = "bank" | "credit_card" | "wallet" | "cash" | "other";

const TYPE_OPTIONS: {
  value: AccountType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  defaultColor: string;
}[] = [
  {
    value: "bank",
    label: "Conto bancario",
    description: "Il conto corrente principale o secondario presso una banca",
    icon: Banknote,
    defaultColor: "#2563eb",
  },
  {
    value: "credit_card",
    label: "Carta di credito",
    description: "Le spese vengono tracciate qui, addebito mensile al conto bancario",
    icon: CreditCard,
    defaultColor: "#dc2626",
  },
  {
    value: "wallet",
    label: "Wallet / Conto digitale",
    description: "Revolut, PayPal balance, Stripe balance, ecc.",
    icon: Wallet,
    defaultColor: "#8b5cf6",
  },
  {
    value: "cash",
    label: "Contanti",
    description: "Cassa fisica / piccola cassa aziendale",
    icon: Coins,
    defaultColor: "#16a34a",
  },
  {
    value: "other",
    label: "Altro",
    description: "Altro tipo di conto / liquidità",
    icon: Box,
    defaultColor: "#6b7280",
  },
];

const COLOR_PRESETS = [
  "#2563eb", "#16a34a", "#dc2626", "#f97316", "#eab308",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#6b7280",
];

const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF"];

export function AccountWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: tipo
  const [type, setType] = useState<AccountType | null>(null);

  // Step 2: dati
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);

  // Step 3: saldo + opzioni
  const [openingBalance, setOpeningBalance] = useState("0");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");

  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    createAccountAction,
    null,
  );

  // Quando l'utente cambia tipo, aggiorna colore default
  function selectType(t: AccountType) {
    setType(t);
    const opt = TYPE_OPTIONS.find((o) => o.value === t);
    if (opt) setColor(opt.defaultColor);
    setStep(2);
  }

  // Successo → la server action fa redirect server-side a /conti.
  // Qui gestiamo solo gli errori.

  const canGoStep3 = name.trim().length > 0 && currency.length === 3;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 text-xs">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={cn(
                "h-6 w-6 rounded-full border flex items-center justify-center font-medium",
                step >= n
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border",
              )}
            >
              {step > n ? <Check className="h-3 w-3" /> : n}
            </div>
            {n < 3 && (
              <div
                className={cn(
                  "h-px w-12",
                  step > n ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* === STEP 1: Tipo === */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Che tipo di conto è?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Seleziona il tipo. Potrai aggiungere altri conti in seguito.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selectType(opt.value)}
                  className="text-left rounded-lg border border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors px-4 py-3 flex items-start gap-3 group"
                >
                  <div
                    className="rounded-md p-2 shrink-0"
                    style={{ backgroundColor: opt.defaultColor + "20" }}
                  >
                    <Icon className="h-4 w-4" style={{ color: opt.defaultColor }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {opt.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* === STEP 2: Dati anagrafici === */}
      {step === 2 && type && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Dati del conto</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Dai un nome e personalizza il conto.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Nome del conto</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === "bank"
                    ? "Es. Intesa Sanpaolo - Conto Business"
                    : type === "credit_card"
                      ? "Es. American Express Business"
                      : type === "wallet"
                        ? "Es. Revolut EUR"
                        : "Es. Cassa Studio"
                }
                maxLength={100}
              />
            </div>

            <div>
              <Label>
                {type === "credit_card" || type === "bank"
                  ? "Ultime 4 cifre / IBAN parziale"
                  : "Identificativo"}{" "}
                <span className="text-[10px] text-muted-foreground">opzionale</span>
              </Label>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={type === "credit_card" ? "**** 4164" : ""}
                maxLength={30}
                className="font-mono"
              />
            </div>

            <div>
              <Label>Valuta</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label>Colore identificativo</Label>
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
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canGoStep3}>
              Avanti
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 3: Saldo + isPrimary + submit === */}
      {step === 3 && type && (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="identifier" value={identifier} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="color" value={color} />

          <div>
            <h3 className="text-lg font-semibold tracking-tight">Saldo iniziale e opzioni</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ultimo passo. Inserisci il saldo di partenza (può essere zero).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Saldo iniziale ({currency})</Label>
              <Input
                type="number"
                step="0.01"
                name="openingBalance"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0,00"
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Il saldo corrente = questo + entrate − uscite del conto.
              </p>
            </div>

            <div>
              <Label>Conto principale</Label>
              <label className="inline-flex items-center gap-2 h-9 text-sm">
                <input
                  type="checkbox"
                  name="isPrimary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-muted-foreground">
                  Marca come conto principale
                </span>
              </label>
              <p className="text-[11px] text-muted-foreground mt-1">
                Un solo conto può essere principale. È il default per nuovi movimenti.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label>
                Note <span className="text-[10px] text-muted-foreground">opzionale</span>
              </Label>
              <Textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Eventuali note interne sul conto"
                maxLength={2000}
                rows={2}
              />
            </div>
          </div>

          {state && !state.ok && state.errors._ && (
            <div className="rounded-md border border-danger/30 bg-danger-muted px-3 py-2 text-sm text-danger">
              {state.errors._}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creo il conto…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Crea conto
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
