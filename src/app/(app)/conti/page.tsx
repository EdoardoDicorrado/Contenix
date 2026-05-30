import { EmptyState } from "@/components/ui/empty-state";
import { listAccountsWithBalance } from "@/lib/db/queries/financial-accounts";
import { formatCurrency } from "@/lib/utils";
import { NewAccountButton } from "./new-account-button";
import { ContiListClient, type AccountItem } from "./conti-list-client";

export default async function ContiPage() {
  const accounts = await listAccountsWithBalance();

  const totalBalance = accounts.reduce(
    (sum, a) => sum + parseFloat(a.computedBalance ?? "0"),
    0,
  );

  const accountItems: AccountItem[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    isPrimary: a.isPrimary,
    color: a.color,
    identifier: a.identifier,
    currency: a.currency,
    openingBalance: a.openingBalance,
    computedBalance: a.computedBalance,
    movementsCount: a.movementsCount,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Conti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.length} {accounts.length === 1 ? "conto" : "conti"} ·
            saldo complessivo:{" "}
            <span
              className={
                totalBalance >= 0
                  ? "text-success font-medium"
                  : "text-danger font-medium"
              }
            >
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
        <ContiListClient accounts={accountItems} />
      )}
    </div>
  );
}
