"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  AlertCircle,
  FileWarning,
  ArrowRight,
  CheckCircle2,
  CalendarClock,
  Link2,
} from "lucide-react";
import {
  getNotificationsAction,
  type Notification,
  type NotificationsResult,
} from "@/app/(app)/notifications-actions";

const POLL_MS = 60_000;

/**
 * Variante "rail" della campanella notifiche. Differenze rispetto a
 * NotificationBell originale:
 *  - Trigger compatto a 48×48 (stessa dimensione delle RailIcon)
 *  - Tooltip nero al hover (come le altre RailIcon)
 *  - Popover esce a DESTRA dell'icona (left-full ml-2) invece che sotto
 */
export function RailNotification() {
  const pathname = usePathname();
  const [data, setData] = useState<NotificationsResult>({
    total: 0,
    notifications: [],
  });
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  function refresh() {
    startTransition(async () => {
      try {
        const res = await getNotificationsAction();
        setData(res);
      } catch {
        // ignora
      }
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    refresh();
  }, [pathname]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { total, notifications } = data;
  const hasAlerts = total > 0;
  const badgeLabel = total > 99 ? "99+" : String(total);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={hasAlerts ? `${total} notifiche` : "Notifiche"}
        className="group relative h-12 w-12 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {hasAlerts && (
          <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-danger text-[10px] font-semibold text-white inline-flex items-center justify-center tabular-nums">
            {badgeLabel}
          </span>
        )}
        {!open && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          >
            Notifiche
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 bottom-0 w-96 rounded-md border border-border bg-background shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium">Notifiche</h3>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="text-[10.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {pending ? "Aggiorno…" : "Aggiorna"}
            </button>
          </div>

          {!hasAlerts ? (
            <div className="px-4 py-8 text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <p className="text-sm font-medium">Tutto sotto controllo</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nessuna azione richiesta al momento.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  let icon: React.ReactNode;
  switch (notification.kind) {
    case "invoices_to_review":
      icon = <AlertCircle className="h-4 w-4 text-danger" />;
      break;
    case "monthly_reminder":
      icon = <CalendarClock className="h-4 w-4 text-amber-600" />;
      break;
    case "matches_pending_approval":
      icon = <Link2 className="h-4 w-4 text-foreground" />;
      break;
    default:
      icon = <FileWarning className="h-4 w-4 text-foreground" />;
  }

  return (
    <li>
      <Link
        href={notification.href}
        onClick={onClick}
        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            {notification.title}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5 break-words">
            {notification.description}
          </div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
      </Link>
    </li>
  );
}
