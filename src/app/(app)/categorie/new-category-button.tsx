"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/ui/add-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { ColorPicker } from "@/components/ui/color-picker";
import { createCategoryInlineAction } from "./inline-actions";

export function NewCategoryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState("#6b7280");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType("expense");
    setColor("#6b7280");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createCategoryInlineAction({
        name: name.trim(),
        type,
        color,
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
      <AddButton label="Nuova categoria" onClick={() => setOpen(true)} />

      {open && (
        <OverlayModal
          title="Nuova categoria"
          icon={<Tags className="h-4 w-4 text-blue-600" />}
          onClose={() => {
            if (!pending) {
              reset();
              setOpen(false);
            }
          }}
          size="sm"
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Software, Stipendi, Vendite…"
                disabled={pending}
              />
            </div>

            <div>
              <Label htmlFor="cat-type">Tipo</Label>
              <Select
                id="cat-type"
                value={type}
                onChange={(e) => setType(e.target.value as "income" | "expense")}
                disabled={pending}
              >
                <option value="expense">Uscita</option>
                <option value="income">Entrata</option>
              </Select>
            </div>

            <div>
              <Label>Colore</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

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
              <Button onClick={handleSubmit} disabled={!name.trim() || pending} className="gap-2">
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crea categoria
              </Button>
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}
