import Link from "next/link";
import { Sparkles, FileSpreadsheet, ArrowRight } from "lucide-react";
import { ImportClient } from "./import-client";
import { listCategories } from "@/lib/db/queries/categories";
import { listAccounts, getPrimaryAccount } from "@/lib/db/queries/financial-accounts";

export default async function ImportaPage() {
  const [categories, accounts, primary] = await Promise.all([
    listCategories(),
    listAccounts({ activeOnly: true }),
    getPrimaryAccount(),
  ]);
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Importa movimenti</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Due modalità: <strong>AI intelligente</strong> per Excel di qualsiasi banca, oppure{" "}
          <strong>CSV manuale</strong> con mapping colonne.
        </p>
      </div>

      {/* Promo AI */}
      <Link
        href="/importa-ai"
        className="rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors px-4 py-4 flex items-start justify-between gap-4 group"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Importa Excel con AI (consigliato)</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Trascina un Excel di Intesa, PayPal, Unicredit, ecc. — l&apos;AI riconosce il formato
              automaticamente. Costo ~€0,02 per file.
            </div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      {/* Sezione CSV manuale */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            CSV / Excel con mapping manuale
          </span>
        </div>
        <ImportClient
          categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            isPrimary: a.isPrimary,
          }))}
          defaultAccountId={primary?.id ?? null}
        />
      </div>
    </div>
  );
}
