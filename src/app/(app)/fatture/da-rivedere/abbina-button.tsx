"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { AbbinaPickerOverlay } from "./abbina-picker-overlay";
import type { PickerInvoice } from "../movement-picker-overlay";

/**
 * Bottone "Abbina" della riga su /fatture/da-rivedere. Apre il picker
 * stile "Riabbina" che mostra fattura a sinistra e movimenti suggeriti
 * con score a destra.
 */
export function AbbinaButton({ invoice }: { invoice: PickerInvoice }) {
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
        <AbbinaPickerOverlay invoice={invoice} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
