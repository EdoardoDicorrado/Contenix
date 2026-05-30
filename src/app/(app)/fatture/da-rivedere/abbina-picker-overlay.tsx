"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MovementPickerOverlay,
  type PickerInvoice,
} from "../movement-picker-overlay";
import {
  linkInvoiceMovementAction,
  findAggregateSuggestionsForInvoiceAction,
  linkAggregatePaymentAction,
  type AggregateSuggestion,
} from "../abbina-actions";

/**
 * Wrapper "Abbina" sopra MovementPickerOverlay. Crea un nuovo match
 * `approved` (link manuale, non passa da approvazione) tra la fattura e
 * il movimento scelto. Mostra inoltre potenziali pagamenti aggregati
 * (1 movimento → N fatture stesso fornitore) per click singolo.
 */
export function AbbinaPickerOverlay({
  invoice,
  onClose,
}: {
  invoice: PickerInvoice;
  onClose: () => void;
}) {
  const router = useRouter();
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
      const res = await linkInvoiceMovementAction({
        invoiceId: invoice.id,
        movementId,
        matchedAmount: matched.toFixed(2),
      });
      if (res.ok) {
        toast.success("Match creato");
        router.refresh();
        onClose();
      } else toast.error(res.error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAggregateConfirm(s: AggregateSuggestion) {
    setBusyAggregateId(s.movement.id);
    try {
      const res = await linkAggregatePaymentAction({
        movementId: s.movement.id,
        invoiceIds: s.invoices.map((i) => i.id),
      });
      if (res.ok) {
        toast.success(
          `Match aggregato creato (${res.created} fatture collegate)`,
        );
        router.refresh();
        onClose();
      } else {
        toast.error(
          res.created > 0
            ? `${res.error} (${res.created} fatture collegate prima dell'errore)`
            : res.error,
        );
      }
    } finally {
      setBusyAggregateId(null);
    }
  }

  return (
    <MovementPickerOverlay
      invoice={invoice}
      title="Abbina un movimento alla fattura"
      subtitle="I candidati sono ordinati per probabilità. Click su 'Usa questo' per creare il match."
      asideHint={`Cerca tra i movimenti ${
        invoice.type === "sale" ? "in entrata" : "in uscita"
      } compatibili. Ordinati per probabilità di match.`}
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
