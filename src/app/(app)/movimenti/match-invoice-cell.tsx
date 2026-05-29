"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getMovementMatchesAction, type MovementInvoiceMatch } from "./match-actions";
import { AbbinaFatturaOverlay } from "../fatture/abbina-overlays";

/**
 * Cella della tabella movimenti che mostra il "match fattura" associato.
 *
 *  - Vuoto → "—" (lato server non sappiamo se ce ne sono in arrivo)
 *  - 1 match → "n. 123 · Acme" cliccabile → overlay con dettaglio
 *  - N match (pagamento aggregato) → "n. 123 +N altre"
 */
export function MatchInvoiceCell({
  movementId,
  movementDate,
  movementDescription,
  movementAmount,
  movementType,
  primaryInvoiceId,
  primaryInvoiceNumber,
  primaryInvoiceCounterparty,
  primaryInvoiceType,
  matchCount,
}: {
  movementId: string;
  movementDate?: Date;
  movementDescription?: string;
  movementAmount?: string;
  movementType?: "income" | "expense";
  primaryInvoiceId: string | null;
  primaryInvoiceNumber: string | null;
  primaryInvoiceCounterparty: string | null;
  primaryInvoiceType: "sale" | "purchase" | null;
  matchCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [abbinaOpen, setAbbinaOpen] = useState(false);

  if (matchCount === 0 || !primaryInvoiceId) {
    return (
      <>
        {movementDescription && movementAmount && movementType && movementDate ? (
          <button
            type="button"
            onClick={() => setAbbinaOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
            title="Cerca una fattura da abbinare"
          >
            <Link2 className="h-3 w-3" />
            Abbina
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
        {abbinaOpen && movementDescription && movementAmount && movementType && movementDate && (
          <AbbinaFatturaOverlay
            movementId={movementId}
            movementDescription={movementDescription}
            movementAmount={movementAmount}
            movementType={movementType}
            movementDate={movementDate}
            onClose={() => setAbbinaOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-foreground hover:underline max-w-full"
        title={`Vedi ${matchCount === 1 ? "fattura collegata" : "fatture collegate"}`}
      >
        {primaryInvoiceType === "sale" ? (
          <ArrowUpRight className="h-3 w-3 text-success shrink-0" />
        ) : primaryInvoiceType === "purchase" ? (
          <ArrowDownLeft className="h-3 w-3 text-danger shrink-0" />
        ) : (
          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-mono truncate">
          {primaryInvoiceNumber ?? "—"}
        </span>
        {primaryInvoiceCounterparty && (
          <span className="text-muted-foreground truncate">
            · {primaryInvoiceCounterparty}
          </span>
        )}
        {matchCount > 1 && (
          <Badge tone="neutral" className="shrink-0">
            +{matchCount - 1}
          </Badge>
        )}
      </button>
      {open && (
        <MatchOverlay movementId={movementId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function MatchOverlay({
  movementId,
  onClose,
}: {
  movementId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MovementInvoiceMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let mounted = true;
    getMovementMatchesAction(movementId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok) setData(res.matches);
        else setError(res.error);
      })
      .catch(() => mounted && setError("Errore caricamento"));
    return () => {
      mounted = false;
    };
  }, [movementId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-xl w-full my-auto">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Fatture collegate al movimento
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data ? `${data.length} ${data.length === 1 ? "fattura" : "fatture"} matchate` : ""}
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

        <div className="p-2">
          {error ? (
            <div className="px-3 py-6 text-center text-sm text-danger">{error}</div>
          ) : !data ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento…
            </div>
          ) : data.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nessuna fattura collegata.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((inv) => {
                const matched = parseFloat(inv.matchedAmount);
                const total = parseFloat(inv.totalAmount);
                const partial = matched < total - 0.005;
                return (
                  <li
                    key={inv.matchId}
                    className="px-3 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {inv.type === "sale" ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                      ) : (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/fatture/${inv.id}`}
                          onClick={onClose}
                          className="text-sm font-mono font-medium text-foreground hover:underline"
                        >
                          {inv.number}
                        </Link>
                        <div className="text-xs text-foreground mt-0.5 break-words">
                          {inv.counterpartyName}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
                          <span>{formatDate(new Date(inv.issueDate))}</span>
                          <span>·</span>
                          <span>Totale {formatCurrency(total)}</span>
                          <Badge tone="neutral">
                            {inv.matchType === "manual"
                              ? "Manuale"
                              : inv.matchType === "ai"
                                ? "AI"
                                : "Auto"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm tabular-nums font-medium text-foreground">
                        {formatCurrency(matched)}
                      </div>
                      {partial && (
                        <div className="text-[10px] text-muted-foreground">
                          parziale ({Math.round((matched / total) * 100)}%)
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
