"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Link2,
  Ban,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getMovementMatchesAction,
  type MovementInvoiceMatch,
} from "./match-actions";
import {
  linkInvoiceMovementAction,
  setMovementMatchUnavailableAction,
} from "../fatture/abbina-actions";
import {
  InvoicePickerOverlay,
  type PickerMovement,
} from "../fatture/invoice-picker-overlay";

/**
 * Cella della tabella movimenti che mostra il match fattura associato.
 *
 *  - matchUnavailable=true → "Non abbinabile" + opzione "Riabilita"
 *  - matchCount=0          → "Abbina" (apre il picker) + opzione "Non abbinabile"
 *  - matchCount=1          → "n. 123 · Acme" cliccabile → overlay riassuntivo
 *  - matchCount>1          → "n. 123 +N altre" (pagamento aggregato)
 */
export function MatchInvoiceCell({
  movementId,
  movementDate,
  movementDescription,
  movementAmount,
  movementType,
  matchUnavailable,
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
  matchUnavailable?: boolean;
  primaryInvoiceId: string | null;
  primaryInvoiceNumber: string | null;
  primaryInvoiceCounterparty: string | null;
  primaryInvoiceType: "sale" | "purchase" | null;
  matchCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyUnavailable, setBusyUnavailable] = useState(false);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);

  const movementReady =
    !!movementDescription && !!movementAmount && !!movementType && !!movementDate;

  async function toggleUnavailable(value: boolean) {
    setMenuOpen(false);
    setBusyUnavailable(true);
    try {
      const res = await setMovementMatchUnavailableAction({
        movementId,
        value,
      });
      if (res.ok) {
        toast.success(
          value
            ? "Movimento marcato come non abbinabile"
            : "Movimento riabilitato per l'abbinamento",
        );
        router.refresh();
      } else toast.error(res.error);
    } finally {
      setBusyUnavailable(false);
    }
  }

  async function handlePickInvoice(invoiceId: string, amount: string) {
    setBusyInvoiceId(invoiceId);
    try {
      const matched = Math.min(
        parseFloat(amount),
        Math.abs(parseFloat(movementAmount ?? "0")),
      );
      const res = await linkInvoiceMovementAction({
        invoiceId,
        movementId,
        matchedAmount: matched.toFixed(2),
      });
      if (res.ok) {
        toast.success("Fattura abbinata al movimento");
        router.refresh();
        setPickerOpen(false);
      } else toast.error(res.error);
    } finally {
      setBusyInvoiceId(null);
    }
  }

  // 1) Stato: non abbinabile
  if (matchUnavailable) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Ban className="h-3 w-3" />
        Non abbinabile
        <button
          type="button"
          onClick={() => toggleUnavailable(false)}
          disabled={busyUnavailable}
          className="text-foreground hover:underline disabled:opacity-50 ml-1"
        >
          {busyUnavailable ? "…" : "Riabilita"}
        </button>
      </div>
    );
  }

  // 2) Stato: nessun match
  if (matchCount === 0 || !primaryInvoiceId) {
    if (!movementReady) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    return (
      <>
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-foreground hover:underline pr-1"
            title="Cerca una fattura da abbinare"
          >
            <Link2 className="h-3 w-3" />
            Abbina
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
              className="text-muted-foreground hover:text-foreground p-0.5"
              aria-label="Altre opzioni"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            {menuOpen && (
              <div className="absolute z-50 right-0 mt-1 w-56 rounded-md border border-border bg-background shadow-md py-1 text-xs">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleUnavailable(true)}
                  disabled={busyUnavailable}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted text-foreground inline-flex items-center gap-2"
                >
                  <Ban className="h-3 w-3 text-muted-foreground" />
                  Segna come non abbinabile
                </button>
                <p className="px-3 pt-1 pb-1.5 text-[10.5px] text-muted-foreground leading-snug">
                  Per commissioni, IVA, stipendi.
                </p>
              </div>
            )}
          </div>
        </div>
        {pickerOpen && movementReady && (
          <InvoicePickerOverlay
            movement={
              {
                id: movementId,
                date: movementDate!,
                amount: movementAmount!,
                type: movementType!,
                description: movementDescription!,
              } satisfies PickerMovement
            }
            title="Abbina una fattura al movimento"
            subtitle="I candidati sono ordinati per probabilità. Click su 'Usa questa' per creare il match."
            asideHint={`Cerca tra le fatture ${
              movementType === "income" ? "di vendita" : "di acquisto"
            } compatibili. Ordinate per probabilità di match.`}
            busyInvoiceId={busyInvoiceId}
            onSelect={handlePickInvoice}
            onClose={() => setPickerOpen(false)}
            onMarkUnmatchable={() => {
              setPickerOpen(false);
              toggleUnavailable(true);
            }}
            unmatchableBusy={busyUnavailable}
          />
        )}
      </>
    );
  }

  // 3) Stato: matchato (1 o più)
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
              {data
                ? `${data.length} ${data.length === 1 ? "fattura" : "fatture"} matchate`
                : ""}
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
