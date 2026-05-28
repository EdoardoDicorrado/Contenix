"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { archiveChangeLogAction } from "./actions";

/**
 * Quando il log supera la soglia (100), mostra un banner che propone di
 * archiviare conservando gli ultimi 30.
 */
export function ArchivePrompt({ totalCount }: { totalCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const res = await archiveChangeLogAction();
      if (res.ok) {
        setResult({ ok: true, msg: `${res.deleted} righe archiviate. Restano gli ultimi 30.` });
        setTimeout(() => {
          setOpen(false);
          router.refresh();
        }, 1500);
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <>
      <div className="rounded-lg border border-foreground/30 bg-muted p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Archive className="h-4 w-4 text-foreground shrink-0" />
          <div className="text-sm">
            <span className="font-medium">{totalCount}</span> cambiamenti registrati.
            Lo storico è cresciuto: vuoi conservare solo gli{" "}
            <span className="font-medium">ultimi 30</span> e archiviare il resto?
          </div>
        </div>
        <Button onClick={() => setOpen(true)} variant="secondary" className="shrink-0">
          Pulisci storico
        </Button>
      </div>

      {open && (
        <OverlayModal
          title="Archivia storico cambiamenti"
          icon={<Archive className="h-4 w-4 text-foreground" />}
          onClose={() => {
            if (!pending && !result?.ok) setOpen(false);
          }}
          size="sm"
        >
          {result?.ok ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div className="text-sm text-center text-foreground">{result.msg}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">
                Verranno cancellati{" "}
                <strong>{Math.max(0, totalCount - 30)}</strong> cambiamenti dal log.
                Resteranno conservati solo i <strong>30 più recenti</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                I movimenti veri non vengono toccati: solo lo storico delle
                ri-assegnazioni di categoria. L&apos;operazione non è reversibile.
              </p>

              {result && !result.ok && (
                <div className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {result.msg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Annulla
                </Button>
                <Button onClick={handleConfirm} disabled={pending} className="gap-2">
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Conferma e archivia
                </Button>
              </div>
            </div>
          )}
        </OverlayModal>
      )}
    </>
  );
}
