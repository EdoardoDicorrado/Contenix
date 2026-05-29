"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  markAsTransferAction,
  unmarkAsTransferAction,
} from "./transfer-actions";

export type AccountOption = {
  id: string;
  name: string;
  type: string;
};

/**
 * Pulsante inline nella tabella movimenti per marcare/smarcare un movimento
 * come trasferimento tra conti. Click → modal compatto con:
 *  - select conto destinazione (esclude il source)
 *  - checkbox "salva regola" + pattern (default = descrizione troncata)
 *  - submit
 *
 * Se il movimento è già transfer, mostra un'icona "annulla transfer".
 */
export function TransferInlineButton({
  movementId,
  description,
  sourceAccountId,
  isTransfer,
  accounts,
}: {
  movementId: string;
  description: string;
  sourceAccountId: string | null;
  isTransfer: boolean;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const targetable = accounts.filter((a) => a.id !== sourceAccountId);

  function handleUnmark() {
    if (!confirm("Annullare il flag trasferimento per questo movimento?")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("movementId", movementId);
      const res = await unmarkAsTransferAction(fd);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      formData.append("movementId", movementId);
      const res = await markAsTransferAction(formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (isTransfer) {
    return (
      <button
        type="button"
        onClick={handleUnmark}
        disabled={pending}
        title="Annulla trasferimento"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Marca come trasferimento tra conti"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </button>

      {open && (
        <TransferModal
          description={description}
          targetable={targetable}
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

function TransferModal({
  description,
  targetable,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  description: string;
  targetable: AccountOption[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [saveRule, setSaveRule] = useState(true);
  const defaultPattern = description.trim().slice(0, 60);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <form
        action={onSubmit}
        className="bg-background rounded-lg border border-border shadow-xl max-w-md w-full my-auto"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              Marca come trasferimento
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              I trasferimenti tra conti non contano nel P&amp;L e vengono
              esclusi dal match fatture.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded hover:bg-muted disabled:opacity-50"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 flex flex-col gap-4">
          <div className="text-xs text-muted-foreground">
            Movimento:{" "}
            <span className="text-foreground font-medium">{description}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="targetAccountId" className="text-xs font-medium">
              Conto di destinazione
            </label>
            <select
              id="targetAccountId"
              name="targetAccountId"
              required
              defaultValue=""
              disabled={pending}
              className={cn(
                "h-9 rounded-md border border-input bg-background px-2 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <option value="" disabled>
                Scegli conto…
              </option>
              {targetable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              name="saveAsRule"
              checked={saveRule}
              onChange={(e) => setSaveRule(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>
              Salva regola: marca automaticamente come trasferimento i futuri
              movimenti con questo pattern in descrizione.
            </span>
          </label>

          {saveRule && (
            <div className="flex flex-col gap-1">
              <label htmlFor="rulePattern" className="text-xs font-medium">
                Pattern
              </label>
              <input
                id="rulePattern"
                name="rulePattern"
                type="text"
                defaultValue={defaultPattern}
                disabled={pending}
                maxLength={200}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[10.5px] text-muted-foreground">
                Almeno 3 caratteri. Match case-insensitive nella descrizione.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-md p-2">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
          >
            Annulla
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-4 w-4" />
            )}
            {pending ? "Marcatura…" : "Marca come trasferimento"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
