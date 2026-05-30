"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PushDrawer } from "@/components/ui/push-drawer";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SyncStatusCard, type MovementsStats } from "./sync-status-card";
import { EmployeeSyncCard, type EmployeeStats } from "./employee-sync-card";
import { InvoiceSyncCard, type InvoiceMatchStats } from "./invoice-sync-card";

const BTN_CLASS = cn(
  "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
  "bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer",
);

/**
 * Bottoni "Sincronizza" che aprono un PushDrawer laterale (al posto del vecchio
 * modale fullscreen). Il drawer scivola da destra spingendo il main, niente
 * card, contenuto coerente con drawer di /movimenti.
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
      <button type="button" onClick={() => setOpen(true)} className={BTN_CLASS}>
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      <PushDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="inline-flex items-center gap-2">
            Sincronizza categorie
            <InfoTooltip>
              Applica le regole pattern → categoria a tutti i movimenti. Le righe
              senza match finiscono in &quot;Da rivedere&quot;.
            </InfoTooltip>
          </span>
        }

      >
        <SyncStatusCard stats={stats} />
      </PushDrawer>
    </>
  );
}

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
      <button type="button" onClick={() => setOpen(true)} className={BTN_CLASS}>
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      <PushDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Sincronizza dipendenti"
        subtitle="Match nome + cognome nella descrizione dei movimenti per allocazione automatica."

      >
        <EmployeeSyncCard stats={stats} />
      </PushDrawer>
    </>
  );
}

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
      <button type="button" onClick={() => setOpen(true)} className={BTN_CLASS}>
        <Wand2 className="h-4 w-4" />
        {label}
      </button>
      <PushDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Sincronizza match fatture"
        subtitle="Crea automaticamente i link fattura ↔ movimento sui suggerimenti con score ≥ 90."

      >
        <InvoiceSyncCard stats={stats} />
      </PushDrawer>
    </>
  );
}
