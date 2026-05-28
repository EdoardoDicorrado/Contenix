import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Wallet,
  Coins,
  Box,
  Star,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAccount } from "@/lib/db/queries/financial-accounts";
import { listMovements } from "@/lib/db/queries/movements";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteAccountAction } from "../actions";

const TYPE_LABEL: Record<string, string> = {
  bank: "Conto bancario",
  credit_card: "Carta di credito",
  wallet: "Wallet digitale",
  cash: "Contanti",
  other: "Altro",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  bank: Banknote,
  credit_card: CreditCard,
  wallet: Wallet,
  cash: Coins,
  other: Box,
};

export default async function DettaglioContoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const movements = await listMovements({ accountId: id });
  const totalIn = movements.reduce(
    (s, m) => s + (m.type === "income" ? parseFloat(m.amount) : 0),
    0,
  );
  const totalOut = movements.reduce(
    (s, m) => s + (m.type === "expense" ? parseFloat(m.amount) : 0),
    0,
  );
  const balance = parseFloat(account.openingBalance) + totalIn - totalOut;

  const Icon = TYPE_ICON[account.type] ?? Box;
  const color = account.color ?? "#6b7280";

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/conti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Conti
        </Link>

        <div className="flex items-start justify-between gap-4 mt-2">
          <div className="flex items-start gap-3">
            <div
              className="rounded-lg p-2.5 shrink-0"
              style={{ backgroundColor: color + "20" }}
            >
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{account.name}</h2>
                {account.isPrimary && (
                  <Star className="h-4 w-4 text-primary fill-primary" aria-label="Conto principale" />
                )}
                {!account.isActive && <Badge tone="neutral">Inattivo</Badge>}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {TYPE_LABEL[account.type]}
                {account.identifier && ` · ${account.identifier}`}
                {account.currency !== "EUR" && ` · ${account.currency}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/conti/${id}/modifica`}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" />
                Modifica
              </Button>
            </Link>
            <form action={deleteAccountAction}>
              <input type="hidden" name="id" value={id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Elimina
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* KPI saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Saldo corrente
          </div>
          <div
            className={
              "text-3xl font-semibold tabular-nums mt-1 " +
              (balance >= 0 ? "text-foreground" : "text-danger")
            }
          >
            {formatCurrency(balance)}
            {account.currency !== "EUR" && (
              <span className="text-sm ml-2 text-muted-foreground">{account.currency}</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Iniziale {formatCurrency(parseFloat(account.openingBalance))} +{" "}
            {formatCurrency(totalIn)} entrate −{" "}
            {formatCurrency(totalOut)} uscite
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Entrate totali
          </div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-success">
            {formatCurrency(totalIn)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Uscite totali
          </div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-danger">
            {formatCurrency(totalOut)}
          </div>
        </div>
      </div>

      {/* Movimenti del conto */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Movimenti ({movements.length})
          </span>
          <Link href={`/movimenti/nuovo?accountId=${id}`}>
            <Button size="sm" variant="secondary">
              <Plus className="h-3.5 w-3.5" />
              Aggiungi
            </Button>
          </Link>
        </div>

        {movements.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nessun movimento su questo conto.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {movements.slice(0, 50).map((m) => {
              const isIncome = m.type === "income";
              const amount = parseFloat(m.amount);
              return (
                <li key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-sm text-foreground truncate">{m.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(m.date)}
                      {m.categoryName && ` · ${m.categoryName}`}
                    </span>
                  </div>
                  <span
                    className={
                      "text-sm font-medium tabular-nums shrink-0 " +
                      (isIncome ? "text-success" : "text-danger")
                    }
                  >
                    {isIncome ? "+" : "−"}
                    {formatCurrency(amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {movements.length > 50 && (
          <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border bg-muted/30">
            Mostrati i 50 più recenti su {movements.length} totali.{" "}
            <Link href={`/movimenti?accountId=${id}`} className="text-primary hover:underline">
              Vedi tutti →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
