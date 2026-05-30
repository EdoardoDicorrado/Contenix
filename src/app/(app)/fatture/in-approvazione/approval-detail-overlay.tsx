"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Loader2,
  ArrowLeftRight,
  Calendar,
  FileText,
  Wallet,
  RefreshCcw,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  approveGroupAction,
  approveMatchAction,
  listGroupSiblingsAction,
  type AggregateSibling,
  type PendingApproval,
} from "./approval-actions";
import { SwapMovementOverlay } from "./swap-movement-overlay";

/**
 * Overlay dettaglio approvazione: fattura a sinistra, movimento a destra,
 * con possibilità di cambiare il movimento (riusa lo stesso pattern di
 * ricerca del flow Abbina).
 */
export function ApprovalDetailOverlay({
  pending,
  onClose,
  onChanged,
}: {
  pending: PendingApproval;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pendingTx, startTransition] = useTransition();
  const [swapOpen, setSwapOpen] = useState(false);
  const [siblings, setSiblings] = useState<AggregateSibling[] | null>(null);
  const isAggregate = pending.aggregateGroupSize > 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isAggregate) {
      setSiblings(null);
      return;
    }
    let mounted = true;
    listGroupSiblingsAction(pending.movement.id, pending.matchId)
      .then((res) => {
        if (mounted) setSiblings(res);
      })
      .catch(() => mounted && setSiblings([]));
    return () => {
      mounted = false;
    };
  }, [isAggregate, pending.movement.id, pending.matchId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleApprove() {
    startTransition(async () => {
      const res = await approveMatchAction(pending.matchId);
      if (res.ok) {
        toast.success("Match approvato");
        onChanged();
        onClose();
      } else toast.error(res.error);
    });
  }

  function handleApproveGroup() {
    startTransition(async () => {
      const res = await approveGroupAction(pending.movement.id);
      if (res.approved > 0) {
        toast.success(
          `${res.approved} fatture approvate (pagamento aggregato)`,
          res.failed > 0 ? { description: `${res.failed} falliti` } : undefined,
        );
        onChanged();
        onClose();
      } else if (res.failed > 0) {
        toast.error("Approvazione gruppo fallita");
      }
    });
  }

  const { invoice, movement } = pending;
  const isIncome = movement.type === "income";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-5xl w-full my-8">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 sticky top-0 bg-background z-10 rounded-t-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-medium">Esamina abbinamento</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fattura a sinistra · Movimento suggerito a destra
              </p>
            </div>
            {isAggregate && (
              <Badge tone="primary" className="gap-1">
                <Layers className="h-3 w-3" />
                Pagamento aggregato · {pending.aggregateGroupSize} fatture
              </Badge>
            )}
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

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* SINISTRA — Fattura */}
          <section className="border border-border rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {invoice.type === "sale" ? (
                <ArrowUpRight className="h-4 w-4 text-success" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-danger" />
              )}
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Fattura
              </span>
              <Badge tone="neutral" className="ml-auto">
                {invoice.type === "sale" ? "Vendita" : "Acquisto"}
              </Badge>
            </div>

            <div>
              <div className="font-mono text-sm font-medium">
                {invoice.number}
              </div>
              <div className="text-sm text-foreground mt-1 break-words">
                {invoice.counterpartyName}
              </div>
              {invoice.counterpartyVat && (
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {invoice.counterpartyVat}
                </div>
              )}
            </div>

            <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Emessa">
              {formatDate(invoice.issueDate)}
            </Field>
            {invoice.dueDate && (
              <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Scadenza">
                {formatDate(invoice.dueDate)}
              </Field>
            )}
            <Field icon={<Wallet className="h-3.5 w-3.5" />} label="Totale">
              <span className="tabular-nums font-medium">
                {formatCurrency(parseFloat(invoice.totalAmount))}
              </span>
            </Field>
            {invoice.paymentIban && (
              <Field icon={<Wallet className="h-3.5 w-3.5" />} label="IBAN">
                <span className="font-mono">{invoice.paymentIban}</span>
              </Field>
            )}
            {invoice.description && (
              <Field icon={<FileText className="h-3.5 w-3.5" />} label="Descrizione">
                <span className="break-words">{invoice.description}</span>
              </Field>
            )}
          </section>

          {/* DESTRA — Movimento */}
          <section className="border border-border rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Movimento suggerito
              </span>
              <button
                type="button"
                onClick={() => setSwapOpen(true)}
                className="ml-auto text-xs text-foreground hover:underline"
              >
                Cambia movimento
              </button>
            </div>

            <div>
              <div className="text-sm break-words text-foreground">
                {movement.description}
              </div>
            </div>

            <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Data">
              {formatDate(movement.date)}
            </Field>
            <Field icon={<Wallet className="h-3.5 w-3.5" />} label="Importo">
              <span
                className={
                  "tabular-nums font-medium " +
                  (isIncome ? "text-success" : "text-danger")
                }
              >
                {isIncome ? "+" : "−"}
                {formatCurrency(Math.abs(parseFloat(movement.amount)))}
              </span>
            </Field>
            <Field icon={<Wallet className="h-3.5 w-3.5" />} label="Importo abbinato">
              <span className="tabular-nums font-medium">
                {formatCurrency(parseFloat(pending.matchedAmount))}
              </span>
            </Field>
          </section>
        </div>

        {isAggregate && (
          <section className="border-t border-border px-5 py-3 bg-muted/20">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="h-3.5 w-3.5 text-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Altre fatture coperte dallo stesso movimento
              </span>
            </div>
            {siblings === null ? (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Caricamento…
              </div>
            ) : siblings.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Nessuna fattura fratello trovata (forse già approvate o rifiutate).
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {siblings.map((s) => (
                  <li
                    key={s.matchId}
                    className="text-xs flex items-center gap-2 flex-wrap"
                  >
                    <Link
                      href={`/fatture/${s.invoiceId}`}
                      className="font-mono font-medium text-foreground hover:underline"
                    >
                      {s.invoiceNumber}
                    </Link>
                    <span className="text-muted-foreground truncate max-w-xs">
                      {s.counterpartyName}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDate(s.issueDate)}
                    </span>
                    <span className="tabular-nums text-foreground font-medium ml-auto">
                      {formatCurrency(parseFloat(s.invoiceTotal))}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      · match {formatCurrency(parseFloat(s.matchedAmount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <footer className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSwapOpen(true)}
            disabled={pendingTx}
            className="gap-1.5"
          >
            <RefreshCcw className="h-4 w-4" />
            Riabbina
          </Button>
          {isAggregate && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleApproveGroup}
              disabled={pendingTx}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              Approva gruppo ({pending.aggregateGroupSize})
            </Button>
          )}
          <Button
            type="button"
            onClick={handleApprove}
            disabled={pendingTx}
            className="gap-1.5"
          >
            {pendingTx ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approva singolo
          </Button>
        </footer>
      </div>

      {swapOpen && (
        <SwapMovementOverlay
          matchId={pending.matchId}
          invoice={{
            id: invoice.id,
            type: invoice.type,
            number: invoice.number,
            counterpartyName: invoice.counterpartyName,
            counterpartyVat: invoice.counterpartyVat,
            issueDate: invoice.issueDate,
            totalAmount: invoice.totalAmount,
          }}
          onClose={() => setSwapOpen(false)}
          onSwapped={() => {
            setSwapOpen(false);
            onChanged();
            onClose();
          }}
        />
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-xs flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-foreground flex-1 min-w-0">{children}</span>
    </div>
  );
}

