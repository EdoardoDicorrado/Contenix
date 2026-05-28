/**
 * Modello dati + helpers del filtro periodo.
 * Modulo "neutro" (no "use client") così sia server components sia client
 * components possono importarlo.
 */

/**
 * Tipologie di periodo supportate:
 *  - `all`: nessun filtro
 *  - `month`: un mese specifico (campo `month` = "YYYY-MM")
 *  - `quarter`: ultimi 3 mesi rolling
 *  - `ytd`: dall'1 gennaio dell'anno (default: corrente) fino a oggi
 *  - `year`: ultimi 12 mesi rolling
 *  - `full-year`: anno solare intero (campo `year`)
 *  - `quarter-of-year`: trimestre specifico Q1-Q4 di un anno (campi `year`, `quarter`)
 *  - `range`: range custom (campi `from`, `to` = "YYYY-MM-DD")
 */
export type PeriodKind =
  | "all"
  | "month"
  | "quarter"
  | "ytd"
  | "year"
  | "full-year"
  | "quarter-of-year"
  | "range";

export type PeriodValue = {
  kind: PeriodKind;
  month?: string;
  from?: string;
  to?: string;
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
};

const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

/**
 * Label umano del periodo (per il bottone, header, ecc.).
 */
export function describePeriod(p: PeriodValue): string {
  const curYear = new Date().getUTCFullYear();
  switch (p.kind) {
    case "all":
      return "Sempre";
    case "month":
      return p.month ? formatMonth(p.month) : "Mese…";
    case "quarter":
      return "Ultimi 3 mesi";
    case "ytd": {
      const y = p.year ?? curYear;
      return y === curYear ? "Anno corrente" : `Da inizio ${y}`;
    }
    case "year":
      return "Ultimi 12 mesi";
    case "full-year":
      return `Anno ${p.year ?? curYear}`;
    case "quarter-of-year": {
      const q = p.quarter ?? 1;
      const y = p.year ?? curYear;
      return `Q${q} ${y}`;
    }
    case "range":
      if (p.from && p.to) {
        const f = new Date(p.from).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
        });
        const t = new Date(p.to).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });
        return `${f} → ${t}`;
      }
      return "Personalizzato…";
  }
}

/**
 * Converte un PeriodValue in finestra temporale `{ from, to }` per query SQL.
 * Riferito al momento corrente (UTC).
 */
export function periodToWindow(p: PeriodValue): { from?: Date; to?: Date } {
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth();
  switch (p.kind) {
    case "all":
      return {};
    case "month": {
      if (!p.month) return {};
      const [yy, mm] = p.month.split("-").map(Number);
      return {
        from: new Date(Date.UTC(yy, mm - 1, 1)),
        to: new Date(Date.UTC(yy, mm, 1)),
      };
    }
    case "quarter":
      return {
        from: new Date(Date.UTC(curY, curM - 2, 1)),
        to: new Date(Date.UTC(curY, curM + 1, 1)),
      };
    case "ytd": {
      const y = p.year ?? curY;
      // Se è l'anno corrente, taglia a fine mese corrente; altrimenti tutto l'anno
      const endMonth = y === curY ? curM + 1 : 12;
      return {
        from: new Date(Date.UTC(y, 0, 1)),
        to: new Date(Date.UTC(y, endMonth, 1)),
      };
    }
    case "year":
      return {
        from: new Date(Date.UTC(curY, curM - 11, 1)),
        to: new Date(Date.UTC(curY, curM + 1, 1)),
      };
    case "full-year": {
      const y = p.year ?? curY;
      return {
        from: new Date(Date.UTC(y, 0, 1)),
        to: new Date(Date.UTC(y + 1, 0, 1)),
      };
    }
    case "quarter-of-year": {
      const y = p.year ?? curY;
      const q = p.quarter ?? 1;
      const startMonth = (q - 1) * 3;
      return {
        from: new Date(Date.UTC(y, startMonth, 1)),
        to: new Date(Date.UTC(y, startMonth + 3, 1)),
      };
    }
    case "range":
      return {
        from: p.from ? new Date(p.from) : undefined,
        to: p.to
          ? new Date(new Date(p.to).getTime() + 24 * 3600 * 1000)
          : undefined,
      };
  }
}

/**
 * Serializza come querystring per la URL.
 */
export function periodToQueryString(p: PeriodValue): string {
  const params = new URLSearchParams();
  if (p.kind === "all") return "";
  params.set("period", p.kind);
  if (p.kind === "month" && p.month) params.set("month", p.month);
  if (p.kind === "range") {
    if (p.from) params.set("from", p.from);
    if (p.to) params.set("to", p.to);
  }
  if (p.year != null && (p.kind === "ytd" || p.kind === "full-year" || p.kind === "quarter-of-year")) {
    params.set("year", String(p.year));
  }
  if (p.quarter != null && p.kind === "quarter-of-year") {
    params.set("quarter", String(p.quarter));
  }
  return params.toString();
}

/**
 * Deserializza dai searchParams.
 */
export function periodFromSearchParams(sp: {
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  year?: string;
  quarter?: string;
}): PeriodValue {
  const k = sp.period as PeriodKind | undefined;
  if (!k || k === "all") return { kind: "all" };
  if (k === "month") return { kind: "month", month: sp.month };
  if (k === "range") return { kind: "range", from: sp.from, to: sp.to };
  if (k === "quarter" || k === "year") return { kind: k };
  if (k === "ytd") return { kind: "ytd", year: sp.year ? Number(sp.year) : undefined };
  if (k === "full-year") return { kind: "full-year", year: sp.year ? Number(sp.year) : undefined };
  if (k === "quarter-of-year") {
    const q = sp.quarter ? Number(sp.quarter) : 1;
    return {
      kind: "quarter-of-year",
      year: sp.year ? Number(sp.year) : undefined,
      quarter: (q >= 1 && q <= 4 ? q : 1) as 1 | 2 | 3 | 4,
    };
  }
  return { kind: "all" };
}

export function shiftMonth(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
