/**
 * Modello dati + helpers del filtro periodo.
 * Modulo "neutro" (no "use client") così sia server components sia client
 * components possono importarlo.
 */

export type PeriodKind = "all" | "month" | "quarter" | "ytd" | "year" | "range";

export type PeriodValue = {
  kind: PeriodKind;
  /** Per `month`: stringa "YYYY-MM" */
  month?: string;
  /** Per `range`: "YYYY-MM-DD" */
  from?: string;
  to?: string;
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
  switch (p.kind) {
    case "all":
      return "Sempre";
    case "month":
      return p.month ? formatMonth(p.month) : "Mese…";
    case "quarter":
      return "Ultimi 3 mesi";
    case "ytd":
      return "Anno corrente";
    case "year":
      return "Ultimi 12 mesi";
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
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
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
        from: new Date(Date.UTC(y, m - 2, 1)),
        to: new Date(Date.UTC(y, m + 1, 1)),
      };
    case "ytd":
      return {
        from: new Date(Date.UTC(y, 0, 1)),
        to: new Date(Date.UTC(y, m + 1, 1)),
      };
    case "year":
      return {
        from: new Date(Date.UTC(y, m - 11, 1)),
        to: new Date(Date.UTC(y, m + 1, 1)),
      };
    case "range":
      return {
        from: p.from ? new Date(p.from) : undefined,
        to: p.to
          ? new Date(new Date(p.to).getTime() + 24 * 3600 * 1000) // estremo to inclusivo
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
}): PeriodValue {
  const k = sp.period as PeriodKind | undefined;
  if (!k || k === "all") return { kind: "all" };
  if (k === "month") return { kind: "month", month: sp.month };
  if (k === "range") return { kind: "range", from: sp.from, to: sp.to };
  if (k === "quarter" || k === "ytd" || k === "year") return { kind: k };
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
