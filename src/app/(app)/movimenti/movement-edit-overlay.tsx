"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { CategoryOption } from "@/components/ui/category-combo";
import { MovementForm } from "./movement-form";
import { updateMovementInlineAction } from "./actions";

type Employee = { id: string; firstName: string; lastName: string };
type AccountOption = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "wallet" | "cash" | "other";
  isPrimary: boolean;
};

/**
 * Overlay per modificare un movimento senza navigare via dalla tabella.
 * Riusa `MovementForm` con la variante inline della action (no redirect).
 */
export function MovementEditOverlay({
  movement,
  categories,
  employees,
  accounts,
  onClose,
}: {
  movement: {
    id: string;
    date: string;
    amount: string;
    type: "income" | "expense";
    description: string;
    categoryId: string | null;
    employeeId: string | null;
    accountId: string | null;
    isTransfer: boolean;
    transferToAccountId: string | null;
  };
  categories: CategoryOption[];
  employees: Employee[];
  accounts: AccountOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const boundAction = updateMovementInlineAction.bind(null, movement.id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-3xl w-full my-8">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 sticky top-0 bg-background z-10 rounded-t-lg">
          <div>
            <h3 className="text-sm font-medium">Modifica movimento</h3>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {movement.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded hover:bg-muted"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          <MovementForm
            action={boundAction}
            categories={categories}
            employees={employees}
            accounts={accounts}
            defaultValues={{
              date: movement.date,
              amount: movement.amount,
              type: movement.type,
              description: movement.description,
              categoryId: movement.categoryId,
              employeeId: movement.employeeId,
              accountId: movement.accountId,
              isTransfer: movement.isTransfer,
              transferToAccountId: movement.transferToAccountId,
            }}
            submitLabel="Salva"
            onSuccess={() => {
              onClose();
              router.refresh();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
