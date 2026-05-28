"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/utils";
import {
  createCategoryInlineAction,
  type InlineCreateResult,
} from "@/app/(app)/categorie/inline-actions";

export type CategoryOption = {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string | null;
};

type Props = {
  name?: string; // nome del campo form (se in form HTML)
  categories: CategoryOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Se impostato, filtra le opzioni a questo tipo (consigliato quando il movimento ha già un tipo). */
  filterType?: "income" | "expense";
  /** Tipo della nuova categoria creata inline. Se non passato, usa filterType o "expense". */
  newCategoryType?: "income" | "expense";
  /** Quando una nuova categoria viene creata, aggiungerla allo stato locale del genitore. */
  onCategoryCreated?: (cat: CategoryOption) => void;
  placeholder?: string;
  className?: string;
};

export function CategoryCombo({
  name,
  categories,
  value,
  onChange,
  filterType,
  newCategoryType,
  onCategoryCreated,
  placeholder = "— Seleziona categoria —",
  className,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = filterType ? categories.filter((c) => c.type === filterType) : categories;
  const incomeOpts = options.filter((c) => c.type === "income");
  const expenseOpts = options.filter((c) => c.type === "expense");

  const targetType = newCategoryType ?? filterType ?? "expense";

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res: InlineCreateResult = await createCategoryInlineAction({
        name: trimmed,
        type: targetType,
        color: newColor,
      });
      if (res.ok) {
        onCategoryCreated?.(res.category);
        onChange(res.category.id);
        setCreating(false);
        setNewName("");
        setNewColor("#6b7280");
      } else {
        setError(res.error);
      }
    });
  }

  if (creating) {
    return (
      <div className={cn("flex flex-col gap-2 p-2 rounded-md border border-border bg-background", className)}>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="Nome nuova categoria…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCreating(false);
                setNewName("");
                setError(null);
              }
            }}
            disabled={pending}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            disabled={pending || !newName.trim()}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Crea"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setCreating(false);
              setNewName("");
              setError(null);
            }}
            disabled={pending}
            aria-label="Annulla"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} size="sm" />
        <p className="text-[11px] text-muted-foreground">
          Sarà <strong>{targetType === "income" ? "entrata" : "uscita"}</strong>.
          Invio per confermare, Esc per annullare.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  // Hidden input per submit form HTML
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.6rem center",
        }}
        className={cn(
          "h-9 flex-1 rounded-md border border-input bg-background text-foreground px-3 pr-9 text-sm shadow-xs appearance-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        )}
      >
        <option value="">{placeholder}</option>
        {filterType ? (
          options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
        ) : (
          <>
            {incomeOpts.length > 0 && (
              <optgroup label="Entrate">
                {incomeOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {expenseOpts.length > 0 && (
              <optgroup label="Uscite">
                {expenseOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </>
        )}
      </select>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setCreating(true)}
        aria-label="Crea nuova categoria"
        title="Crea nuova categoria"
      >
        <Plus className="h-3.5 w-3.5" />
        Nuova
      </Button>
    </div>
  );
}
