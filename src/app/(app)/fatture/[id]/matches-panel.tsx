import Link from "next/link";
import { Link2, Unlink2, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getInvoiceMatches, suggestMatches, getMatchedTotal } from "@/lib/db/queries/matches";
import { classifyScore } from "@/lib/invoice-matching";
import { linkMovementAction, unlinkMatchAction } from "./match-actions";

const SCORE_TONE: Record<string, "success" | "primary" | "neutral" | "danger"> = {
  certain: "success",
  probable: "primary",
  weak: "neutral",
  low: "neutral",
};

const SCORE_LABEL: Record<string, string> = {
  certain: "Quasi certo",
  probable: "Probabile",
  weak: "Debole",
  low: "Basso",
};

export async function MatchesPanel({
  invoiceId,
  invoiceTotal,
}: {
  invoiceId: string;
  invoiceTotal: number;
}) {
  const [linked, suggestions, matchedTotal] = await Promise.all([
    getInvoiceMatches(invoiceId),
    suggestMatches(invoiceId),
    getMatchedTotal(invoiceId),
  ]);

  const remaining = invoiceTotal - matchedTotal;
  const fullyMatched = Math.abs(remaining) < 0.01;

  // Data pagamento dedotta: data del movimento collegato più recente quando matched è completo
  const latestPaymentDate =
    fullyMatched && linked.length > 0
      ? linked.reduce<Date | null>(
          (acc, l) => (acc === null || l.movement.date > acc ? l.movement.date : acc),
          null,
        )
      : null;

  return (
    <>
      {fullyMatched && latestPaymentDate && (
        <div className="rounded-md border border-success/30 bg-success-muted px-4 py-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-foreground">Pagata il {formatDate(latestPaymentDate)}</span>
            <span className="text-muted-foreground ml-2">
              · Importo coperto dai movimenti bancari collegati
            </span>
          </div>
        </div>
      )}

      {/* Linked movements */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Movimenti collegati
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              Collegato: <span className="text-foreground font-medium">{formatCurrency(matchedTotal)}</span>
              {" / "}
              {formatCurrency(invoiceTotal)}
            </span>
            {fullyMatched ? (
              <Badge tone="success">Pagata</Badge>
            ) : matchedTotal > 0 ? (
              <Badge tone="primary">Parziale</Badge>
            ) : null}
          </div>
        </div>

        {linked.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessun movimento ancora collegato a questa fattura.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {linked.map((l) => {
              const isIncome = l.movement.type === "income";
              return (
                <li key={l.id} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex flex-col gap-0.5 flex-1">
                    <span className="text-sm text-foreground whitespace-pre-wrap break-words">
                      {l.movement.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(l.movement.date)} ·{" "}
                      <Badge tone="neutral" className="ml-1">
                        {l.matchType === "manual" ? "Manuale" : l.matchType === "ai" ? "AI" : "Auto"}
                      </Badge>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={
                        "tabular-nums font-medium text-sm " +
                        (isIncome ? "text-success" : "text-danger")
                      }
                    >
                      {isIncome ? "+" : "−"}
                      {formatCurrency(parseFloat(l.matchedAmount))}
                    </span>
                    <form action={unlinkMatchAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="invoiceId" value={invoiceId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label="Scollega"
                        className="text-danger hover:bg-danger/10"
                      >
                        <Unlink2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && !fullyMatched && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-primary/20 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary uppercase tracking-wider">
              Suggerimenti automatici
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {suggestions.length} candidati basati su importo, data, controparte
            </span>
          </div>
          <ul className="divide-y divide-primary/10">
            {suggestions.map((s) => {
              const isIncome = s.movement.type === "income";
              const cls = classifyScore(s.score);
              const suggestedAmount = Math.min(
                parseFloat(s.movement.amount),
                remaining > 0 ? remaining : invoiceTotal,
              );
              return (
                <li key={s.movement.id} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex flex-col gap-1 flex-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-sm text-foreground whitespace-pre-wrap break-words flex-1 min-w-0">
                        {s.movement.description}
                      </span>
                      <Badge tone={SCORE_TONE[cls]} className="shrink-0 mt-0.5">
                        {SCORE_LABEL[cls]} · {s.score}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(s.movement.date)} ·{" "}
                      <span
                        className={
                          "tabular-nums font-medium " +
                          (isIncome ? "text-success" : "text-danger")
                        }
                      >
                        {isIncome ? "+" : "−"}
                        {formatCurrency(parseFloat(s.movement.amount))}
                      </span>
                    </span>
                    {s.reasons.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground mt-1 list-disc list-inside marker:text-muted-foreground/60">
                        {s.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <form action={linkMovementAction} className="flex items-center gap-2 shrink-0">
                    <input type="hidden" name="invoiceId" value={invoiceId} />
                    <input type="hidden" name="movementId" value={s.movement.id} />
                    <input
                      name="matchedAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={suggestedAmount.toFixed(2)}
                      className="h-8 w-24 px-2 rounded-md border border-input bg-background text-xs text-right tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Importo da collegare"
                    />
                    <Button type="submit" size="sm">
                      <Link2 className="h-3.5 w-3.5" />
                      Collega
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {suggestions && suggestions.length === 0 && linked.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nessun movimento candidato trovato. Importa l&apos;estratto conto da{" "}
            <Link href="/importa" className="text-primary hover:underline">
              /importa
            </Link>{" "}
            oppure collega manualmente dal dettaglio movimento.
          </p>
        </div>
      )}
    </>
  );
}
