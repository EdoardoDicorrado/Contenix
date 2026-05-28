import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = "EUR") {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Formato "umano" del tempo trascorso da una data:
 *   < 1 min  → "appena ora"
 *   < 1 h    → "X min fa"
 *   < 1 g    → "Xh fa"
 *   < 7 g    → "Xg fa"
 *   altro    → data formattata (es. "15 mar 2025")
 *
 * `compact: true` produce versione più corta (per spazi ristretti) usando
 * "ora" invece di "appena ora" e senza l'anno nella data finale.
 */
export function formatRelative(date: Date | string, compact = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return compact ? "ora" : "appena ora";
  if (diffMin < 60) return compact ? `${diffMin} min` : `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}g fa`;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    ...(compact ? {} : { year: "numeric" }),
  }).format(d);
}
