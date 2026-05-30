"use client";

import { useRouter } from "next/navigation";

/**
 * Wrapper client per rendere un `<tr>` di fattura cliccabile: porta a
 * `/fatture/${id}`. Le celle interne con bottoni/form/link interattivi
 * devono fare `stopPropagation` per evitare la navigazione globale.
 */
export function ClickableInvoiceRow({
  invoiceId,
  backHref,
  children,
}: {
  invoiceId: string;
  /** URL relativo (sotto /fatture) a cui tornare con "Torna indietro". */
  backHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const target = backHref
    ? `/fatture/${invoiceId}?back=${encodeURIComponent(backHref)}`
    : `/fatture/${invoiceId}`;
  return (
    <tr
      onClick={() => router.push(target)}
      className="hover:bg-muted/30 transition-colors cursor-pointer"
    >
      {children}
    </tr>
  );
}

/**
 * Cella che assorbe il click — usata per le celle azioni (modifica, elimina)
 * che non devono triggerare la navigazione della riga.
 */
export function StopClickCell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </td>
  );
}
