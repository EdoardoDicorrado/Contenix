"use client";

import { useRouter } from "next/navigation";
import { PeriodFilter } from "@/components/ui/period-filter";
import { periodToQueryString, type PeriodValue } from "@/lib/period";

export function DashboardPeriodBar({ initialPeriod }: { initialPeriod: PeriodValue }) {
  const router = useRouter();

  function setPeriod(p: PeriodValue) {
    const qs = periodToQueryString(p);
    router.push(qs ? `/?${qs}` : "/");
  }

  return <PeriodFilter value={initialPeriod} onChange={setPeriod} />;
}
