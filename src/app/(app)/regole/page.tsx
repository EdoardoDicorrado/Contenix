import Link from "next/link";
import { ArrowLeftRight, Tag, Trash2, Wand2 } from "lucide-react";
import { listRules } from "@/lib/db/queries/categorization-rules";
import { listTransferRules } from "@/lib/db/queries/transfer-rules";
import { listCategories } from "@/lib/db/queries/categories";
import { listAccounts } from "@/lib/db/queries/financial-accounts";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { deleteTransferRuleAction } from "./actions";
import { NewRuleButton } from "./new-rule-form";
import { RulesByCategory } from "./rules-by-category";

export default async function RegolePage() {
  const [categoryRules, transferRules, categories, accounts] = await Promise.all([
    listRules(),
    listTransferRules(),
    listCategories(),
    listAccounts({ activeOnly: false }),
  ]);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Regole</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crea nuove regole per applicare automaticamente categorie ai tuoi movimenti.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sincronizza"
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors"
          >
            <Wand2 className="h-4 w-4" />
            Sincronizza
          </Link>
          <NewRuleButton
            categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          />
        </div>
      </div>

      {/* Regole di categorizzazione (vista a card per categoria) */}
      <section className="flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-medium">Regole di categorizzazione</h3>
          </div>
          <div className="text-xs text-muted-foreground">
            Click su una card per espandere · sposta o elimina ogni regola
          </div>
        </header>

        {categoryRules.length === 0 ? (
          <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
            Nessuna regola attiva. Vengono create automaticamente durante l&apos;import
            (se spunti &quot;salva regola&quot;) o dall&apos;
            <Link href="/importa-storico" className="text-blue-700 hover:underline">
              import storico
            </Link>
            , oppure puoi crearne una manualmente sopra.
          </div>
        ) : (
          <RulesByCategory
            rules={categoryRules.map((r) => ({
              id: r.id,
              pattern: r.pattern,
              categoryId: r.categoryId,
              categoryName: r.categoryName,
              categoryColor: r.categoryColor,
              categoryType: r.categoryType,
              movementType: r.movementType,
              matchCount: r.matchCount,
              createdAt: r.createdAt,
              lastMatchedAt: r.lastMatchedAt,
            }))}
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              color: c.color,
            }))}
          />
        )}
      </section>

      {/* Regole di trasferimento */}
      <section className="rounded-lg border border-border bg-background overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-medium">Regole di trasferimento</h3>
            <Badge tone="neutral" className="text-[10px]">
              {transferRules.length}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Pattern → conto destinazione
          </div>
        </header>

        {transferRules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nessuna regola di trasferimento. Vengono create quando marchi un movimento
            come &quot;trasferimento&quot; verso un conto secondario (es. estratto carta
            di credito, ricarica Revolut).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pattern</th>
                  <th className="text-left px-4 py-2 font-medium">Conto destinazione</th>
                  <th className="text-left px-4 py-2 font-medium">Solo da conto</th>
                  <th className="text-right px-4 py-2 font-medium">Match</th>
                  <th className="text-left px-4 py-2 font-medium">Ultimo match</th>
                  <th className="text-right px-4 py-2 font-medium">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transferRules.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.pattern}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {r.targetAccountColor && (
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: r.targetAccountColor }}
                          />
                        )}
                        <span>{r.targetAccountName ?? "(eliminato)"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.sourceAccountName ?? "qualsiasi"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.matchCount}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.lastMatchedAt ? formatDate(r.lastMatchedAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteTransferRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-red-50"
                          title="Elimina regola"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
