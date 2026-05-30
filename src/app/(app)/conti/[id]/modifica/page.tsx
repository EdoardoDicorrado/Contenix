import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAccount } from "@/lib/db/queries/financial-accounts";
import { AccountEditForm } from "./account-edit-form";

export default async function ModificaContoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/conti/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna al conto
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">
          Modifica conto
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Aggiorna nome, colore, saldo iniziale e altre opzioni.
        </p>
      </div>

      <AccountEditForm
        id={id}
        defaultValues={{
          name: account.name,
          type: account.type,
          currency: account.currency,
          color: account.color ?? "#6b7280",
          identifier: account.identifier ?? "",
          openingBalance: account.openingBalance,
          notes: account.notes ?? "",
          isPrimary: account.isPrimary,
          isActive: account.isActive,
        }}
      />
    </div>
  );
}
