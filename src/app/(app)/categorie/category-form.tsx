"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import type { CategoryFormState } from "./actions";

type Props = {
  action: (
    prev: CategoryFormState,
    formData: FormData,
  ) => Promise<CategoryFormState>;
  defaultValues?: { name: string; type: "income" | "expense"; color: string };
  submitLabel: string;
};

export function CategoryForm({ action, defaultValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(
    action,
    null,
  );
  const [color, setColor] = useState(defaultValues?.color ?? "#6b7280");
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome" error={err("name")}>
          <Input name="name" defaultValue={defaultValues?.name} required />
        </Field>
        <Field label="Tipo" error={err("type")}>
          <Select name="type" defaultValue={defaultValues?.type ?? "expense"} required>
            <option value="expense">Uscita</option>
            <option value="income">Entrata</option>
          </Select>
        </Field>
      </div>

      <Field label="Colore" error={err("color")} hint="usato come pallino nella lista movimenti">
        <input type="hidden" name="color" value={color} />
        <ColorPicker value={color} onChange={setColor} />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Link href="/categorie">
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
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
