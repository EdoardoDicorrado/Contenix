"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  CreditCard,
  Star,
  ArrowRight,
  Pencil,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getDrawerMovementsAction,
  type DrawerMovement,
} from "./drawer-movements-actions";

const TYPE_LABEL: Record<string, string> = {
  bank: "Conto bancario",
  credit_card: "Carta di credito",
  wallet: "Wallet",
  cash: "Contanti",
  other: "Altro",
};

const DEFAULT_COLOR = "#2563eb";

export type AccountItem = {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
  color: string | null;
  identifier: string | null;
  currency: string;
  openingBalance: string;
  computedBalance: string | null;
  movementsCount: number;
};

export function ContiListClient({ accounts }: { accounts: AccountItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = accounts.find((a) => a.id === openId) ?? null;

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
        {accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            active={openId === a.id}
            onClick={() => setOpenId(a.id)}
          />
        ))}
      </div>

      <DetailDrawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={
          open ? (
            <span className="inline-flex items-center gap-2">
              {open.name}
              {open.isPrimary && (
                <Star className="h-4 w-4 text-primary fill-primary" />
              )}
            </span>
          ) : null
        }
        subtitle={open ? TYPE_LABEL[open.type] : undefined}
      >
        {open && <AccountDetailContent account={open} />}
      </DetailDrawer>
    </>
  );
}

function AccountRow({
  account,
  active,
  onClick,
}: {
  account: AccountItem;
  active: boolean;
  onClick: () => void;
}) {
  const balance = parseFloat(account.computedBalance ?? "0");
  const color = account.color ?? DEFAULT_COLOR;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors " +
        (active ? "bg-muted/60" : "hover:bg-muted/40")
      }
    >
      <CreditCardIcon color={color} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {account.name}
          </span>
          {account.isPrimary && (
            <Star
              className="h-4 w-4 text-primary fill-primary shrink-0"
              aria-label="Conto principale"
            />
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {TYPE_LABEL[account.type]}
          {account.identifier && (
            <>
              {" · "}
              <span className="font-mono">{account.identifier}</span>
            </>
          )}
        </div>
      </div>

      <Badge tone="neutral" className="shrink-0">
        {account.movementsCount} mov.
      </Badge>

      <div className="text-right shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Saldo
        </div>
        <div
          className={
            "text-xl font-semibold tabular-nums " +
            (balance >= 0 ? "text-foreground" : "text-danger")
          }
        >
          {formatCurrency(balance)}
          {account.currency !== "EUR" && (
            <span className="text-xs ml-1 text-muted-foreground">
              {account.currency}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/**
 * Icona "carta di credito" stilizzata, colorabile col color del conto.
 * Sostituisce le icone diverse per tipo (Banknote/Coins/Wallet/Box).
 */
function CreditCardIcon({ color }: { color: string }) {
  return (
    <div
      className="relative h-11 w-16 rounded-md shrink-0 flex flex-col justify-between p-1.5 shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${color} 0%, ${shade(color, -20)} 100%)`,
      }}
    >
      <CreditCard className="h-3 w-3 text-white/80" />
      <div className="flex gap-0.5">
        <div className="h-1 w-2.5 rounded-sm bg-white/40" />
        <div className="h-1 w-2.5 rounded-sm bg-white/40" />
        <div className="h-1 w-2.5 rounded-sm bg-white/40" />
      </div>
    </div>
  );
}

/** Schiarisce o scurisce un hex color di N% (negativo = scuro). */
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  if (isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((255 * percent) / 100)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + Math.round((255 * percent) / 100)));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + Math.round((255 * percent) / 100)));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function AccountDetailContent({ account }: { account: AccountItem }) {
  const balance = parseFloat(account.computedBalance ?? "0");
  const opening = parseFloat(account.openingBalance ?? "0");
  const movements = balance - opening;
  const color = account.color ?? DEFAULT_COLOR;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <CreditCardIcon color={color} />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Saldo corrente
            </div>
            <div
              className={
                "text-2xl font-semibold tabular-nums " +
                (balance >= 0 ? "text-foreground" : "text-danger")
              }
            >
              {formatCurrency(balance)}
              {account.currency !== "EUR" && (
                <span className="text-sm ml-1.5 text-muted-foreground">
                  {account.currency}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Tipo">{TYPE_LABEL[account.type]}</Field>
        {account.identifier && (
          <Field label="Identificativo">
            <span className="font-mono text-sm">{account.identifier}</span>
          </Field>
        )}
        <Field label="Valuta">{account.currency}</Field>
        <Field label="Saldo iniziale">
          <span className="tabular-nums">{formatCurrency(opening)}</span>
        </Field>
        <Field label="Variazione movimenti">
          <span
            className={
              "tabular-nums " +
              (movements >= 0 ? "text-success" : "text-danger")
            }
          >
            {movements >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(movements))}
          </span>
        </Field>
        <Field label="Movimenti totali">
          <span className="tabular-nums">{account.movementsCount}</span>
        </Field>
      </div>

      <div className="border-t border-border pt-4 flex items-center gap-2">
        <Link href={`/conti/${account.id}`} className="flex-1">
          <Button variant="secondary" className="w-full gap-2">
            Apri scheda completa
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href={`/conti/${account.id}/modifica`}>
          <Button variant="ghost" size="icon" aria-label="Modifica conto">
            <Pencil className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <AccountDrawerMovements accountId={account.id} />
    </div>
  );
}

/**
 * Lista paginata "ultimi movimenti" del conto, mostrata nel drawer.
 * Carica 10 alla volta; "Carica di più" appende altri 10.
 */
function AccountDrawerMovements({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<DrawerMovement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Reset al cambio di account
    setRows([]);
    setHasMore(false);
    setTotal(0);
    setLoaded(false);
    startTransition(async () => {
      const res = await getDrawerMovementsAction(accountId, 0);
      setRows(res.rows);
      setHasMore(res.hasMore);
      setTotal(res.total);
      setLoaded(true);
    });
  }, [accountId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function loadMore() {
    startTransition(async () => {
      const res = await getDrawerMovementsAction(accountId, rows.length);
      setRows((prev) => [...prev, ...res.rows]);
      setHasMore(res.hasMore);
    });
  }

  return (
    <div className="border-t border-border pt-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Ultimi movimenti
        </div>
        {loaded && total > 0 && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {rows.length} di {total}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="py-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Nessun movimento su questo conto.
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-background overflow-hidden">
            {rows.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </ul>

          {hasMore && (
            <div className="flex items-center justify-center pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={pending}
                className="gap-1.5 text-xs"
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                Carica di più
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MovementRow({ movement }: { movement: DrawerMovement }) {
  const isIncome = movement.type === "income";
  const display = movement.descriptionClean ?? movement.description;
  const amount = parseFloat(movement.amount);

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      {isIncome ? (
        <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0 mt-1" />
      ) : (
        <ArrowDownLeft className="h-3.5 w-3.5 text-danger shrink-0 mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground line-clamp-2 break-words">
          {display}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
          <span className="tabular-nums">{formatDate(movement.date)}</span>
          {movement.categoryName && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {movement.categoryColor && (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: movement.categoryColor }}
                  />
                )}
                {movement.categoryName}
              </span>
            </>
          )}
        </div>
      </div>
      <div
        className={
          "tabular-nums font-medium text-sm shrink-0 " +
          (isIncome ? "text-success" : "text-danger")
        }
      >
        {isIncome ? "+" : "−"}
        {formatCurrency(Math.abs(amount))}
      </div>
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{children}</span>
    </div>
  );
}
