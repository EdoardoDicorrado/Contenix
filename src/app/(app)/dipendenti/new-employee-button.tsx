"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/ui/add-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { createEmployeeInlineAction } from "./inline-actions";

export function NewEmployeeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [hiredAt, setHiredAt] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("");
    setMonthlyCost("");
    setHiredAt("");
    setActive(true);
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createEmployeeInlineAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        role: role.trim() || undefined,
        monthlyCost: monthlyCost.replace(",", ".").trim() || undefined,
        hiredAt: hiredAt || undefined,
        active,
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
      <AddButton label="Nuovo dipendente" onClick={() => setOpen(true)} />

      {open && (
        <OverlayModal
          title="Nuovo dipendente"
          icon={<Users className="h-4 w-4 text-blue-600" />}
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
                <Label htmlFor="emp-firstName">Nome</Label>
                <Input
                  id="emp-firstName"
                  autoFocus
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="emp-lastName">Cognome</Label>
                <Input
                  id="emp-lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="emp-email">Email</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                  placeholder="opzionale"
                />
              </div>
              <div>
                <Label htmlFor="emp-role">Ruolo</Label>
                <Input
                  id="emp-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={pending}
                  placeholder="opzionale"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="emp-hiredAt">Data assunzione</Label>
                <Input
                  id="emp-hiredAt"
                  type="date"
                  value={hiredAt}
                  onChange={(e) => setHiredAt(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="emp-monthlyCost">Costo mensile (€)</Label>
                <Input
                  id="emp-monthlyCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyCost}
                  onChange={(e) => setMonthlyCost(e.target.value)}
                  disabled={pending}
                  placeholder="0,00"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={pending}
              />
              <span>Dipendente attivo</span>
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
                disabled={!firstName.trim() || !lastName.trim() || pending}
                className="gap-2"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crea dipendente
              </Button>
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}
