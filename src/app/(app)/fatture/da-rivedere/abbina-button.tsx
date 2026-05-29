"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { AbbinaMovimentoOverlay } from "../abbina-overlays";

/**
 * Bottone "Abbina" della riga su /fatture/da-rivedere. Apre l'overlay che
 * permette di cercare un movimento manualmente o selezionarne uno tra i
 * suggerimenti automatici.
 */
export function AbbinaButton({
  invoiceId,
  invoiceNumber,
  invoiceType,
  counterparty,
  totalAmount,
  remainingAmount,
}: {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: "sale" | "purchase";
  counterparty: string;
  totalAmount: string;
  remainingAmount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-colors"
      >
        <Link2 className="h-3 w-3" />
        Abbina
      </button>
      {open && (
        <AbbinaMovimentoOverlay
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          invoiceType={invoiceType}
          counterparty={counterparty}
          totalAmount={totalAmount}
          remainingAmount={remainingAmount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
