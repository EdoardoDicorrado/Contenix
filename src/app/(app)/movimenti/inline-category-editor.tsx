"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  AlertTriangle,
  ArrowRight,
  Trash2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import {
  updateMovementCategoryAction,
  moveConflictingRuleAction,
  deleteConflictingRuleAction,
  type ConflictingRule,
} from "./actions";

/**
 * Cella categoria inline editable: appare come pallino+nome (o "—") e al click
 * diventa un CategoryCombo. Selezione → server action → refresh. Se ci sono
 * regole che potrebbero ri-categorizzare il movimento alla prossima sync,
 * mostra un alert con bottoni per sistemarle.
 */
export function InlineCategoryEditor({
  movementId,
  currentCategoryId,
  currentCategoryName,
  currentCategoryColor,
  movementType,
  categories,
}: {
  movementId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  currentCategoryColor: string | null;
  movementType: "income" | "expense";
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimisticName, setOptimisticName] = useState<{
    name: string;
    color: string | null;
  } | null>(null);
  const [localCategories, setLocalCategories] = useState<CategoryOption[]>(categories);
  const [conflicts, setConflicts] = useState<ConflictingRule[]>([]);
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Snapshot della categoria PRIMA del cambio. Necessaria per "Annulla cambio":
  // dopo router.refresh() la prop currentCategoryId punta alla nuova categoria,
  // quindi non possiamo usarla per fare il rollback.
  const [previousState, setPreviousState] = useState<{
    id: string | null;
    name: string | null;
  } | null>(null);

  function handleChange(picked: string | null) {
    if (picked === currentCategoryId) {
      setEditing(false);
      return;
    }
    // Cattura lo stato PRE-cambio prima di qualunque refresh.
    const snapshot = { id: currentCategoryId, name: currentCategoryName };

    const cat = localCategories.find((c) => c.id === picked);
    if (cat) {
      setOptimisticName({ name: cat.name, color: cat.color });
      setNewCategoryName(cat.name);
    } else {
      setNewCategoryName(null);
    }
    setEditing(false);
    setNewCategoryId(picked);
    setPreviousState(snapshot);

    startTransition(async () => {
      const res = await updateMovementCategoryAction({
        movementId,
        categoryId: picked,
      });
      if (res.ok) {
        setConflicts(res.conflicts);
        if (res.conflicts.length > 0) setModalOpen(true);
        router.refresh();
      } else {
        setOptimisticName(null);
        setPreviousState(null);
      }
    });
  }

  function handleUndo() {
    // Ripristina la categoria pre-cambio salvata in handleChange.
    const target = previousState?.id ?? null;
    startTransition(async () => {
      const res = await updateMovementCategoryAction({
        movementId,
        categoryId: target,
      });
      if (res.ok) {
        setOptimisticName(null);
        setNewCategoryId(null);
        setNewCategoryName(null);
        setPreviousState(null);
        setConflicts([]);
        setModalOpen(false);
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <CategoryCombo
        categories={localCategories}
        value={currentCategoryId}
        onChange={handleChange}
        filterType={movementType}
        onCategoryCreated={(c) => setLocalCategories((prev) => [...prev, c])}
        placeholder="—"
        className="min-w-44"
      />
    );
  }

  const displayName = optimisticName?.name ?? currentCategoryName;
  const displayColor = optimisticName?.color ?? currentCategoryColor;

  const unresolvedCount = conflicts.length;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-left px-1.5 py-0.5 -mx-1.5 rounded hover:bg-muted/60 transition-colors max-w-full"
        title="Click per cambiare categoria"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
        ) : optimisticName ? (
          <Check className="h-3 w-3 text-green-700 shrink-0" />
        ) : (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: displayColor ?? "#a1a1aa" }}
          />
        )}
        <span className={displayName ? "text-foreground truncate" : "text-muted-foreground"}>
          {displayName ?? "—"}
        </span>
      </button>

      {unresolvedCount > 0 && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded border border-foreground/40 bg-muted text-foreground hover:bg-foreground hover:text-background transition-colors text-[10px] font-medium shrink-0"
          title="Una regola riassegnerà questo movimento alla prossima sync. Click per gestirla."
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          {unresolvedCount > 1 ? unresolvedCount : ""} regola
        </button>
      )}

      {modalOpen && conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          newCategoryId={newCategoryId}
          newCategoryName={newCategoryName}
          previousCategoryLabel={previousState?.name ?? "Senza categoria"}
          onResolved={(ruleId) => setConflicts((prev) => prev.filter((c) => c.ruleId !== ruleId))}
          onClose={() => setModalOpen(false)}
          onUndo={handleUndo}
        />
      )}
    </div>
  );
}

function ConflictModal({
  conflicts,
  newCategoryId,
  newCategoryName,
  previousCategoryLabel,
  onResolved,
  onClose,
  onUndo,
}: {
  conflicts: ConflictingRule[];
  newCategoryId: string | null;
  newCategoryName: string | null;
  previousCategoryLabel: string;
  onResolved: (ruleId: string) => void;
  onClose: () => void;
  onUndo: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null);
  const [justResolved, setJustResolved] = useState<Set<string>>(new Set());
  // NOTA: questo modal NON si chiude con ESC né click sul backdrop.
  // L'utente DEVE scegliere un'azione (Sposta/Elimina), "Annulla cambio" o "Ignora".

  function handleMove(ruleId: string) {
    if (!newCategoryId) return;
    setPendingRuleId(ruleId);
    startTransition(async () => {
      const res = await moveConflictingRuleAction({ ruleId, newCategoryId });
      if (res.ok) {
        setJustResolved((prev) => new Set(prev).add(ruleId));
        setTimeout(() => onResolved(ruleId), 400);
        router.refresh();
      }
      setPendingRuleId(null);
    });
  }

  function handleDelete(ruleId: string) {
    setPendingRuleId(ruleId);
    startTransition(async () => {
      const res = await deleteConflictingRuleAction({ ruleId });
      if (res.ok) {
        setJustResolved((prev) => new Set(prev).add(ruleId));
        setTimeout(() => onResolved(ruleId), 400);
        router.refresh();
      }
      setPendingRuleId(null);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-lg w-full my-auto">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-medium">Conflitto di regole</h3>
        </header>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-foreground">
            {conflicts.length === 1 ? (
              <>
                Hai cambiato la categoria di questo movimento, ma una{" "}
                <strong>regola di categorizzazione</strong> attiva lo riassegnerà alla
                prossima sincronizzazione.
              </>
            ) : (
              <>
                Hai cambiato la categoria di questo movimento, ma{" "}
                <strong>{conflicts.length} regole</strong> attive lo riassegneranno alla
                prossima sincronizzazione.
              </>
            )}
            {newCategoryName && (
              <span className="block text-xs text-muted-foreground mt-1">
                Nuova categoria scelta: <strong>{newCategoryName}</strong>
              </span>
            )}
          </p>

          <div className="flex flex-col gap-2">
            {conflicts.map((c) => {
              const isResolved = justResolved.has(c.ruleId);
              const isPending = pendingRuleId === c.ruleId && pending;
              return (
                <div
                  key={c.ruleId}
                  className={`rounded-md border p-3 flex flex-col gap-2 transition-colors ${
                    isResolved
                      ? "border-success/30 bg-success-muted"
                      : "border-border bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <code className="font-mono bg-background border border-border px-1.5 py-0.5 rounded">
                      {c.pattern}
                    </code>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {c.currentCategoryName ?? "(?)"}
                    </span>
                    {c.alsoAffectsCount > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        · usata anche da {c.alsoAffectsCount - 1} altri movimenti
                      </span>
                    )}
                  </div>

                  {isResolved ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-900">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-700" />
                      Regola sistemata
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {newCategoryId && newCategoryName && (
                        <button
                          type="button"
                          onClick={() => handleMove(c.ruleId)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:opacity-90 disabled:opacity-50 text-xs"
                          title={`Sposta in "${newCategoryName}"`}
                        >
                          {isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          Sposta in {newCategoryName}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(c.ruleId)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-50 text-xs"
                        title="Cancella la regola (questo movimento resterà manuale)"
                      >
                        {isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Elimina regola
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <footer className="border-t border-border px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            Risolvi ogni regola, annulla il cambio o ignora.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-background text-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50"
              title={`Riporta la categoria a "${previousCategoryLabel}"`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Annulla cambio
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-muted text-foreground border border-border hover:bg-border/60 transition-colors disabled:opacity-50"
            >
              Ignora
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
