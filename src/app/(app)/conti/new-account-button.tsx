"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, AlertCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { ColorPicker } from "@/components/ui/color-picker";
import { createAccountInlineAction } from "./inline-actions";

const TYPE_OPTIONS = [
  { value: "bank", label: "Banca" },
  { value: "credit_card", label: "Carta di credito" },
  { value: "wallet", label: "Wallet (Revolut/PayPal/Stripe)" },
  { value: "cash", label: "Contanti" },
  { value: "other", label: "Altro" },
] as const;

export function NewAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("bank");
  const [currency, setCurrency] = useState("EUR");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [identifier, setIdentifier] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType("bank");
    setCurrency("EUR");
    setOpeningBalance("0");
    setIdentifier("");
    setColor("#6b7280");
    setIsPrimary(false);
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createAccountInlineAction({
        name: name.trim(),
        type,
        currency: currency.toUpperCase().trim(),
        openingBalance: openingBalance.replace(",", ".").trim() || "0",
        identifier: identifier.trim() || undefined,
        color,
        isPrimary,
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
        Nuovo conto
      </Button>

      {open && (
        <OverlayModal
          title="Nuovo conto"
          icon={<Wallet className="h-4 w-4 text-blue-600" />}
          onClose={() => {
            if (!pending) {
              reset();
              setOpen(false);
            }
          }}
          size="md"
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="acc-name">Nome</Label>
              <Input
                id="acc-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Conto BPER, Revolut, Carta Amex…"
                disabled={pending}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="acc-type">Tipo</Label>
                <Select
                  id="acc-type"
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as (typeof TYPE_OPTIONS)[number]["value"])
                  }
                  disabled={pending}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="acc-currency">Valuta</Label>
                <Input
                  id="acc-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.slice(0, 3).toUpperCase())}
                  disabled={pending}
                  maxLength={3}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="acc-opening">Saldo iniziale</Label>
                <Input
                  id="acc-opening"
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="acc-identifier">Identificativo</Label>
                <Input
                  id="acc-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="es. ultime 4 cifre"
                  disabled={pending}
                  maxLength={30}
                />
              </div>
            </div>

            <div>
              <Label>Colore</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                disabled={pending}
              />
              <span>Conto principale (banca)</span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
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
                disabled={!name.trim() || pending}
                className="gap-2"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crea conto
              </Button>
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}
