import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listCategories } from "@/lib/db/queries/categories";
import { listAccounts, getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { ImportAiClient } from "./import-ai-client";

export default async function ImportaAiPage() {
  const [categories, accounts, primary] = await Promise.all([
    listCategories(),
    listAccounts({ activeOnly: true }),
    getPrimaryAccount(),
  ]);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/importa"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Importa
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Importa Excel intelligente</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un Excel di movimenti (Intesa Sanpaolo, PayPal, Unicredit, ecc.) —
          l&apos;AI riconosce automaticamente il formato e converte i dati senza configurazione manuale.
          Costo: <span className="font-mono">~€0,02</span> per analisi (indipendente dal numero di righe).
        </p>
      </div>

      <ImportAiClient
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          color: c.color,
        }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          color: a.color,
          isPrimary: a.isPrimary,
        }))}
        defaultAccountId={primary?.id ?? null}
      />
    </div>
  );
}
