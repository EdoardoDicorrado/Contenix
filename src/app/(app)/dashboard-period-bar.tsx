"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { PeriodFilter } from "@/components/ui/period-filter";
import { periodToQueryString, type PeriodValue } from "@/lib/period";

/**
 * Barra periodo della dashboard: un unico PeriodFilter completo
 * (Mese specifico, Anno specifico, Ultimi 3/6/12 mesi, Anno corrente,
 * Personalizzato con calendario).
 */
export function DashboardPeriodBar({ initialPeriod }: { initialPeriod: PeriodValue }) {
  const router = useRouter();

  function apply(p: PeriodValue) {
    const qs = periodToQueryString(p);
    router.push(qs ? `/?${qs}` : "/");
  }

  const hasAnyFilter = initialPeriod.kind !== "all";

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <PeriodFilter value={initialPeriod} onChange={apply} />
      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => apply({ kind: "all" })}
          className="h-8 inline-flex items-center gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          title="Rimuovi filtro"
        >
          <X className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}
