import Link from "next/link";
import {
  Banknote,
  CreditCard,
  Wallet,
  Coins,
  Box,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listAccountsWithBalance } from "@/lib/db/queries/financial-accounts";
import { formatCurrency } from "@/lib/utils";
import { NewAccountButton } from "./new-account-button";

const TYPE_LABEL: Record<string, string> = {
  bank: "Conto bancario",
  credit_card: "Carta di credito",
  wallet: "Wallet",
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

export default async function ContiPage() {
  const accounts = await listAccountsWithBalance();

  const totalBalance = accounts.reduce(
    (sum, a) => sum + parseFloat(a.computedBalance ?? "0"),
    0,
  );

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Conti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.length} {accounts.length === 1 ? "conto" : "conti"} ·
            saldo complessivo:{" "}
            <span className={totalBalance >= 0 ? "text-success font-medium" : "text-danger font-medium"}>
              {formatCurrency(totalBalance)}
            </span>
          </p>
        </div>
        <NewAccountButton />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Nessun conto"
          description="Inizia creando il tuo primo conto (bancario, carta di credito, wallet digitale, ecc.)."
          action={<NewAccountButton />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? Box;
            const balance = parseFloat(a.computedBalance ?? "0");
            return (
              <Link
                key={a.id}
                href={`/conti/${a.id}`}
                className="rounded-lg border border-border bg-card hover:border-primary/40 transition-colors p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="rounded-md p-2 shrink-0"
                      style={{ backgroundColor: (a.color ?? "#6b7280") + "20" }}
                    >
                      <Icon className="h-4 w-4" style={{ color: a.color ?? "#6b7280" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {TYPE_LABEL[a.type]}
                        {a.identifier && ` · ${a.identifier}`}
                      </div>
                    </div>
                  </div>
                  {a.isPrimary && (
                    <Star
                      className="h-3.5 w-3.5 text-primary fill-primary shrink-0"
                      aria-label="Conto principale"
                    />
                  )}
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
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
                      {a.currency !== "EUR" && (
                        <span className="text-xs ml-1 text-muted-foreground">{a.currency}</span>
                      )}
                    </div>
                  </div>
                  <Badge tone="neutral">
                    {a.movementsCount} {a.movementsCount === 1 ? "mov." : "mov."}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
