import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { listInvoicesToReview } from "@/lib/db/queries/invoices";
import { periodFromSearchParams, periodToWindow } from "@/lib/period";
import { DaRivedereTable } from "./da-rivedere-table";
import { DaRivedereFilterBar } from "./filter-bar";

type SP = Promise<{
  type?: string;
  search?: string;
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  year?: string;
  quarter?: string;
}>;

export default async function FattureDaRivederePage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const type = sp.type === "purchase" || sp.type === "sale" ? sp.type : undefined;
  const search = sp.search || undefined;
  const period = periodFromSearchParams(sp);
  const { from, to } = periodToWindow(period);

  const rows = await listInvoicesToReview({ type, search, from, to });

  // URL corrente da preservare per il "Torna indietro" della pagina fattura.
  const backHref = buildBackHref(sp);

  // Conteggi rapidi
  const totalsByKind = rows.reduce(
    (acc, r) => {
      const matched = parseFloat(r.matchedAmount);
      if (matched === 0) acc.zero += 1;
      else acc.partial += 1;
      return acc;
    },
    { zero: 0, partial: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/fatture"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna a Fatture
      </Link>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Fatture da rivedere
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fatture senza match con un movimento o con pagamento parziale. Click
          su &quot;Abbina&quot; per cercare il movimento corrispondente con
          score di probabilità.
        </p>
      </div>

      <DaRivedereFilterBar
        initial={{
          type: type ?? "",
          search: search ?? "",
          period,
        }}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna fattura da rivedere"
          description="Nessun risultato per i filtri attuali."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {rows.length}
              </span>{" "}
              fatture
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {totalsByKind.zero}
              </span>{" "}
              senza match
            </span>
            {totalsByKind.partial > 0 && (
              <>
                <span>·</span>
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {totalsByKind.partial}
                  </span>{" "}
                  con match parziale
                </span>
              </>
            )}
          </div>

          <DaRivedereTable rows={rows} backHref={backHref} />
        </>
      )}
    </div>
  );
}

function buildBackHref(sp: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const keys = ["type", "search", "period", "month", "from", "to", "year", "quarter"];
  for (const k of keys) {
    const v = sp[k];
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/fatture/da-rivedere?${qs}` : "/fatture/da-rivedere";
}
