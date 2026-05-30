"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AbbinaButton } from "./abbina-button";

const PAGE_SIZE = 50;

export type InvoiceRow = {
  id: string;
  number: string;
  type: "sale" | "purchase";
  counterpartyName: string;
  counterpartyVat: string | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: string;
  matchedAmount: string;
  isCreditNote: boolean;
};

export function DaRivedereTable({
  rows,
  backHref,
}: {
  rows: InvoiceRow[];
  backHref?: string;
}) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const now = new Date();

  const visible = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;
  const nextChunk = Math.min(PAGE_SIZE, rows.length - visibleCount);

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5 w-8"></th>
              <th className="text-left font-medium px-4 py-2.5">Numero</th>
              <th className="text-left font-medium px-4 py-2.5">Controparte</th>
              <th className="text-left font-medium px-4 py-2.5">Emessa</th>
              <th className="text-left font-medium px-4 py-2.5">Scadenza</th>
              <th className="text-right font-medium px-4 py-2.5">Totale</th>
              <th className="text-right font-medium px-4 py-2.5">Matchato</th>
              <th className="text-right font-medium px-4 py-2.5">Restante</th>
              <th className="px-4 py-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((inv) => {
              const total = parseFloat(inv.totalAmount);
              const matched = parseFloat(inv.matchedAmount);
              const remaining = total - matched;
              const isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
              const partialPct =
                matched > 0 ? Math.round((matched / total) * 100) : 0;

              const target = backHref
                ? `/fatture/${inv.id}?back=${encodeURIComponent(backHref)}`
                : `/fatture/${inv.id}?from=da-rivedere`;
              return (
                <tr
                  key={inv.id}
                  onClick={() => router.push(target)}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    {inv.type === "sale" ? (
                      <ArrowUpRight
                        className="h-4 w-4 text-success"
                        aria-label="Vendita"
                      />
                    ) : (
                      <ArrowDownLeft
                        className="h-4 w-4 text-danger"
                        aria-label="Acquisto"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <span className="text-foreground">{inv.number}</span>
                    {inv.isCreditNote && (
                      <Badge tone="neutral" className="ml-1.5">
                        NC
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">{inv.counterpartyName}</div>
                    {inv.counterpartyVat && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {inv.counterpartyVat}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(inv.issueDate)}
                  </td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {inv.dueDate ? (
                      <span
                        className={
                          isOverdue
                            ? "text-danger font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {formatDate(inv.dueDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {matched > 0 ? (
                      <span className="text-foreground">
                        {formatCurrency(matched)}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({partialPct}%)
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-danger">
                    {formatCurrency(remaining)}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <AbbinaButton
                        invoice={{
                          id: inv.id,
                          type: inv.type,
                          number: inv.number,
                          counterpartyName: inv.counterpartyName,
                          counterpartyVat: inv.counterpartyVat,
                          issueDate: inv.issueDate,
                          totalAmount: inv.totalAmount,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="secondary"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Mostra altri {nextChunk}
            <span className="text-muted-foreground ml-1">
              ({visibleCount} / {rows.length})
            </span>
          </Button>
        </div>
      )}
    </>
  );
}
