"use client";

import { useEffect, useState } from "react";
import { Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncStatusCard, type MovementsStats } from "./sync-status-card";
import { EmployeeSyncCard, type EmployeeStats } from "./employee-sync-card";
import { InvoiceSyncCard, type InvoiceMatchStats } from "./invoice-sync-card";

/**
 * Bottone "Sincronizza" che apre un overlay con la card di sync corrispondente.
 * Stesso stile del bottone Sincronizza già usato in /regole (bg-foreground).
 *
 * Usato in /regole, /movimenti, /categorie con stats categorie.
 */
export function SyncCategoriesButton({
  stats,
  label = "Sincronizza",
}: {
  stats: MovementsStats;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
          "bg-foreground text-background hover:opacity-90 transition-colors",
        )}
      >
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <SyncOverlay
          title="Sincronizza categorie"
          subtitle="Applica le regole pattern → categoria a tutti i movimenti. Le righe senza match finiscono in “Da rivedere”."
          onClose={() => setOpen(false)}
        >
          <SyncStatusCard stats={stats} />
        </SyncOverlay>
      )}
    </>
  );
}

/**
 * Bottone "Sincronizza" per la pagina /dipendenti.
 */
export function SyncEmployeesButton({
  stats,
  label = "Sincronizza",
}: {
  stats: EmployeeStats;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
          "bg-foreground text-background hover:opacity-90 transition-colors",
        )}
      >
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <SyncOverlay
          title="Sincronizza dipendenti"
          subtitle="Match nome + cognome nella descrizione dei movimenti per allocazione automatica."
          onClose={() => setOpen(false)}
        >
          <EmployeeSyncCard stats={stats} />
        </SyncOverlay>
      )}
    </>
  );
}

/**
 * Bottone "Sincronizza" per la pagina /fatture.
 * Esegue il match automatico fattura ↔ movimento sui suggerimenti "certain".
 */
export function SyncInvoicesButton({
  stats,
  label = "Sincronizza",
}: {
  stats: InvoiceMatchStats;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
          "bg-foreground text-background hover:opacity-90 transition-colors",
        )}
      >
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <SyncOverlay
          title="Sincronizza match fatture"
          subtitle="Crea automaticamente i link fattura ↔ movimento sui suggerimenti con score ≥ 90."
          onClose={() => setOpen(false)}
        >
          <InvoiceSyncCard stats={stats} />
        </SyncOverlay>
      )}
    </>
  );
}

function SyncOverlay({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // ESC chiude
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
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg border border-border shadow-xl max-w-3xl w-full my-auto">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
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
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
