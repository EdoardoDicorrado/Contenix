"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MovementPickerOverlay,
  type PickerInvoice,
} from "../movement-picker-overlay";
import {
  findAggregateSuggestionsForInvoiceAction,
  type AggregateSuggestion,
} from "../abbina-actions";
import {
  swapMatchMovementAction,
  swapToAggregateAction,
} from "./approval-actions";

/**
 * Wrapper "Riabbina" sopra MovementPickerOverlay per /fatture/in-approvazione.
 *  - Selezione movimento singolo → aggiorna il match pending col nuovo
 *    movementId (resta pending).
 *  - Conferma di un pagamento aggregato → cancella il pending corrente e crea
 *    N nuovi match pending verso il movimento aggregato.
 */
export function SwapMovementOverlay({
  matchId,
  invoice,
  onClose,
  onSwapped,
}: {
  matchId: string;
  invoice: PickerInvoice;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAggregateId, setBusyAggregateId] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<AggregateSuggestion[]>([]);
  const [loadingAgg, setLoadingAgg] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    findAggregateSuggestionsForInvoiceAction(invoice.id)
      .then((res) => {
        if (!cancelled) setAggregates(res);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgg(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSelect(movementId: string, amount: string) {
    setBusyId(movementId);
    try {
      const matched = Math.min(
        parseFloat(invoice.totalAmount),
        Math.abs(parseFloat(amount)),
      );
      const res = await swapMatchMovementAction({
        matchId,
        newMovementId: movementId,
        matchedAmount: matched.toFixed(2),
      });
      if (res.ok) {
        toast.success(
          "Movimento cambiato — il match resta in attesa di approvazione",
        );
        onSwapped();
      } else toast.error(res.error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAggregateConfirm(s: AggregateSuggestion) {
    setBusyAggregateId(s.movement.id);
    try {
      const res = await swapToAggregateAction({
        matchId,
        movementId: s.movement.id,
        invoiceIds: s.invoices.map((i) => i.id),
      });
      if (res.ok) {
        toast.success(
          `Sostituito con pagamento aggregato (${res.created} fatture) — approva il gruppo`,
        );
        onSwapped();
      } else toast.error(res.error);
    } finally {
      setBusyAggregateId(null);
    }
  }

  return (
    <MovementPickerOverlay
      invoice={invoice}
      title="Riabbina con un altro movimento"
      subtitle="Cerca tra i movimenti compatibili e scegli quello corretto."
      asideHint={`Cerca tra i movimenti ${
        invoice.type === "sale" ? "in entrata" : "in uscita"
      } compatibili. I candidati sono ordinati per probabilità di match.`}
      busyMovementId={busyId}
      onSelect={handleSelect}
      onClose={onClose}
      aggregateSuggestions={aggregates}
      loadingAggregates={loadingAgg}
      busyAggregateMovementId={busyAggregateId}
      onAggregateConfirm={handleAggregateConfirm}
    />
  );
}
