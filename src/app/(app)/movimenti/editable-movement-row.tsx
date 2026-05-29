"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryOption } from "@/components/ui/category-combo";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InlineCategoryEditor } from "./inline-category-editor";
import { TransferInlineButton } from "./transfer-inline-button";
import { MatchInvoiceCell } from "./match-invoice-cell";
import { MovementEditOverlay } from "./movement-edit-overlay";
import { deleteMovementAction } from "./actions";

type Employee = { id: string; firstName: string; lastName: string };
type AccountOption = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "wallet" | "cash" | "other";
  isPrimary: boolean;
  color?: string | null;
};

export type EditableMovement = {
  id: string;
  date: Date;
  amount: string;
  type: "income" | "expense";
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  employeeId: string | null;
  accountId: string | null;
  accountName: string | null;
  accountColor: string | null;
  isTransfer: boolean;
  transferToAccountId: string | null;
  matchedInvoiceId: string | null;
  matchedInvoiceNumber: string | null;
  matchedInvoiceCounterparty: string | null;
  matchedInvoiceType: "sale" | "purchase" | null;
  matchedInvoiceCount: number;
};

/**
 * Riga della tabella movimenti che apre un overlay di modifica al click
 * (sulle aree "passive": data, descrizione, importo). Le celle interattive
 * (conto, categoria, match fattura, transfer, elimina) restano funzionanti
 * grazie a `stopPropagation` sui loro handler.
 */
export function EditableMovementRow({
  movement,
  categories,
  employees,
  accounts,
}: {
  movement: EditableMovement;
  categories: CategoryOption[];
  employees: Employee[];
  accounts: AccountOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const isIncome = movement.type === "income";
  const amount = parseFloat(movement.amount);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setEditOpen(true)}
        title="Click per modificare il movimento"
      >
        <td className="px-4 py-3 text-muted-foreground tabular-nums">
          {formatDate(movement.date)}
        </td>
        <td className="px-4 py-3" onClick={stop}>
          {movement.accountId && movement.accountName ? (
            <Link
              href={`/conti/${movement.accountId}`}
              className="inline-flex items-center gap-1.5 hover:text-primary"
              title={`Vai al conto ${movement.accountName}`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: movement.accountColor ?? "#a1a1aa" }}
              />
              <span className="text-foreground truncate max-w-32">
                {movement.accountName}
              </span>
              {movement.isTransfer && (
                <ArrowLeftRight
                  className="h-3 w-3 text-muted-foreground shrink-0"
                  aria-label="Trasferimento tra conti"
                />
              )}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-foreground">{movement.description}</td>
        <td className="px-4 py-3" onClick={stop}>
          <InlineCategoryEditor
            movementId={movement.id}
            currentCategoryId={movement.categoryId}
            currentCategoryName={movement.categoryName}
            currentCategoryColor={movement.categoryColor}
            movementType={movement.type}
            categories={categories}
          />
        </td>
        <td className="px-4 py-3" onClick={stop}>
          <MatchInvoiceCell
            movementId={movement.id}
            movementDate={movement.date}
            movementDescription={movement.description}
            movementAmount={movement.amount}
            movementType={movement.type}
            primaryInvoiceId={movement.matchedInvoiceId}
            primaryInvoiceNumber={movement.matchedInvoiceNumber}
            primaryInvoiceCounterparty={movement.matchedInvoiceCounterparty}
            primaryInvoiceType={movement.matchedInvoiceType}
            matchCount={movement.matchedInvoiceCount}
          />
        </td>
        <td
          className={
            "px-4 py-3 text-right font-medium tabular-nums " +
            (isIncome ? "text-success" : "text-danger")
          }
        >
          {isIncome ? "+" : "−"}
          {formatCurrency(amount)}
        </td>
        <td className="px-4 py-3" onClick={stop}>
          <div className="flex items-center justify-end gap-1">
            <TransferInlineButton
              movementId={movement.id}
              description={movement.description}
              sourceAccountId={movement.accountId ?? null}
              isTransfer={movement.isTransfer}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
              }))}
            />
            <form action={deleteMovementAction} onClick={stop}>
              <input type="hidden" name="id" value={movement.id} />
              <Button
                variant="ghost"
                size="icon"
                type="submit"
                aria-label="Elimina"
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </td>
      </tr>

      {editOpen && (
        <MovementEditOverlay
          movement={{
            id: movement.id,
            // ISO YYYY-MM-DD per input type=date
            date: new Date(movement.date).toISOString().slice(0, 10),
            amount: movement.amount,
            type: movement.type,
            description: movement.description,
            categoryId: movement.categoryId,
            employeeId: movement.employeeId,
            accountId: movement.accountId,
            isTransfer: movement.isTransfer,
            transferToAccountId: movement.transferToAccountId,
          }}
          categories={categories}
          employees={employees}
          accounts={accounts}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
