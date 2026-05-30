"use server";

import {
  getInvoiceMatchStats,
  listMissingSaleMonths,
} from "@/lib/db/queries/invoices";
import { getPendingCountAction } from "./fatture/in-approvazione/approval-actions";

export type Notification = {
  /** Id stabile per dedup/UI */
  id: string;
  kind:
    | "invoices_to_review"
    | "missing_sale_month"
    | "monthly_reminder"
    | "matches_pending_approval";
  title: string;
  description: string;
  /** Link dove portare l'utente al click */
  href: string;
  /** Quantità rappresentata (per badge / sort) */
  count: number;
};

/** Soglia: il reminder fine mese parte 4 giorni prima dell'ultimo giorno. */
const REMINDER_DAYS_BEFORE_EOM = 4;

export type NotificationsResult = {
  total: number;
  notifications: Notification[];
};

const SALES_HISTORY_START = new Date(Date.UTC(2025, 0, 1));

/**
 * Aggrega gli alert da mostrare nella campanella della topbar.
 *  - Fatture senza match (unmatched > 0)
 *  - Mesi dal 2025 senza alcuna fattura emessa caricata
 *
 * Restituisce sempre `total` come somma dei count, così la topbar può
 * mostrare un solo badge numerico.
 */
export async function getNotificationsAction(): Promise<NotificationsResult> {
  const [matchStats, missingMonths, pendingApprovals] = await Promise.all([
    getInvoiceMatchStats(),
    listMissingSaleMonths(SALES_HISTORY_START),
    getPendingCountAction(),
  ]);

  const notifications: Notification[] = [];

  if (pendingApprovals > 0) {
    notifications.push({
      id: "matches_pending_approval",
      kind: "matches_pending_approval",
      title:
        pendingApprovals === 1
          ? "1 match in approvazione"
          : `${pendingApprovals} match in approvazione`,
      description: "Suggerimenti automatici fattura ↔ movimento da confermare",
      href: "/fatture/in-approvazione",
      count: pendingApprovals,
    });
  }

  if (matchStats.unmatched > 0) {
    notifications.push({
      id: "invoices_to_review",
      kind: "invoices_to_review",
      title:
        matchStats.unmatched === 1
          ? "1 fattura da rivedere"
          : `${matchStats.unmatched} fatture da rivedere`,
      description: "Senza match o con allocazione parziale",
      href: "/fatture/da-rivedere",
      count: matchStats.unmatched,
    });
  }

  if (missingMonths.length > 0) {
    notifications.push({
      id: "missing_sale_month",
      kind: "missing_sale_month",
      title:
        missingMonths.length === 1
          ? "1 mese senza fatture emesse"
          : `${missingMonths.length} mesi senza fatture emesse`,
      description: `Dal 2025: ${missingMonths.slice(0, 6).map(formatMonth).join(", ")}${
        missingMonths.length > 6 ? "…" : ""
      }`,
      href: "/fatture/carica/cassetto",
      count: missingMonths.length,
    });
  }

  const reminder = computeEndOfMonthReminder();
  if (reminder) {
    notifications.push(reminder);
  }

  return {
    total: notifications.reduce((s, n) => s + n.count, 0),
    notifications,
  };
}

/**
 * Restituisce una notifica di reminder se siamo entro `REMINDER_DAYS_BEFORE_EOM`
 * dalla fine del mese corrente. Altrimenti `null`.
 *
 * Esempio per maggio (31 giorni): si attiva dal 28 al 31.
 */
function computeEndOfMonthReminder(): Notification | null {
  const now = new Date();
  // Ultimo giorno del mese corrente (timezone locale)
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const msLeft = eom.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft > REMINDER_DAYS_BEFORE_EOM || daysLeft < 0) return null;

  const eomLabel = eom.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
  });
  const monthLabel = now.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  let title: string;
  if (daysLeft <= 1) {
    title = `Oggi è l'ultimo giorno per caricare le fatture di ${monthLabel}`;
  } else {
    title = `Carica le fatture di ${monthLabel} entro il ${eomLabel}`;
  }

  return {
    id: "monthly_reminder",
    kind: "monthly_reminder",
    title,
    description:
      daysLeft === 1
        ? "Manca 1 giorno alla fine del mese."
        : `Mancano ${daysLeft} giorni alla fine del mese.`,
    href: "/fatture/carica/cassetto",
    count: 1,
  };
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}
