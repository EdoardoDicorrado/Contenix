import Link from "next/link";
import { Pencil, Trash2, ArrowLeftRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewMovementButton } from "./new-movement-button";
import { getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { EmptyState } from "@/components/ui/empty-state";
import {
  countUncategorizedMovements,
  listMonthlyAggregates,
  listMovements,
} from "@/lib/db/queries/movements";
import { listCategories } from "@/lib/db/queries/categories";
import { listAccounts } from "@/lib/db/queries/financial-accounts";
import {
  periodFromSearchParams,
  periodToWindow,
} from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteMovementAction } from "./actions";
import { FilterBar } from "./filter-bar";
import { MonthlyCards } from "./monthly-cards";
import { MonthNavigation } from "./month-navigation";
import { InlineCategoryEditor } from "./inline-category-editor";

type SP = Promise<{
  type?: string;
  categoryIds?: string | string[];
  accountId?: string;
  search?: string;
  period?: string;
  month?: string;
  from?: string;
  to?: string;
}>;

export default async function MovimentiPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const type = sp.type === "income" || sp.type === "expense" ? sp.type : undefined;
  const categoryIds = sp.categoryIds
    ? Array.isArray(sp.categoryIds)
      ? sp.categoryIds
      : [sp.categoryIds]
    : [];
  const accountId = sp.accountId || undefined;
  const search = sp.search || undefined;
  const period = periodFromSearchParams(sp);
  const { from, to } = periodToWindow(period);

  // Vista dettaglio mese se è stato selezionato un mese specifico
  const showMonthDetail = period.kind === "month";
  // Vista tabella anche per range custom / trimestre / anno (no card mensili)
  const showFlatTable =
    period.kind === "range" ||
    period.kind === "quarter" ||
    period.kind === "ytd" ||
    period.kind === "year";

  const extraQs = buildExtraQs({ type, categoryIds, accountId, search });

  // Caricamento condizionale per evitare query inutili
  const wantsMovements = showMonthDetail || showFlatTable;
  const [cats, accounts, uncategorizedCount, monthlyData, movs, primaryAccount] =
    await Promise.all([
      listCategories(),
      listAccounts({ activeOnly: false }),
      countUncategorizedMovements(),
      listMonthlyAggregates({ type, categoryIds, accountId, search }),
      wantsMovements
        ? listMovements({ type, categoryIds, accountId, search, from, to })
        : Promise.resolve([] as Awaited<ReturnType<typeof listMovements>>),
      getPrimaryAccount(),
    ]);

  const availableMonths = monthlyData.map((m) => m.month);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Movimenti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {wantsMovements
              ? `${movs.length} ${movs.length === 1 ? "movimento" : "movimenti"} nel periodo`
              : `${monthlyData.length} ${monthlyData.length === 1 ? "mese" : "mesi"} con movimenti`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {uncategorizedCount > 0 && (
            <Link href="/movimenti/da-rivedere">
              <Button variant="secondary" className="gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {uncategorizedCount} da rivedere
              </Button>
            </Link>
          )}
          <NewMovementButton
            categories={cats.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              color: c.color,
            }))}
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              isPrimary: a.isPrimary,
            }))}
            defaultAccountId={primaryAccount?.id ?? null}
          />
        </div>
      </div>

      <FilterBar
        categories={cats.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        initial={{ type, accountId, categoryIds, search: search ?? "", period }}
      />

      {!wantsMovements ? (
        <MonthlyCards data={monthlyData} extraQs={extraQs} />
      ) : (
        <>
          {showMonthDetail && period.month && (
            <MonthNavigation
              currentMonth={period.month}
              availableMonths={availableMonths}
              extraQs={extraQs}
            />
          )}

          {movs.length === 0 ? (
            <EmptyState
              title="Nessun movimento nel periodo selezionato"
              description="Cambia periodo dalla barra dei filtri."
            />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Data</th>
                    <th className="text-left font-medium px-4 py-2.5">Conto</th>
                    <th className="text-left font-medium px-4 py-2.5">Descrizione</th>
                    <th className="text-left font-medium px-4 py-2.5">Categoria</th>
                    <th className="text-left font-medium px-4 py-2.5">Dipendente</th>
                    <th className="text-right font-medium px-4 py-2.5">Importo</th>
                    <th className="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movs.map((m) => {
                    const isIncome = m.type === "income";
                    const amount = parseFloat(m.amount);
                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {formatDate(m.date)}
                        </td>
                        <td className="px-4 py-3">
                          {m.accountId && m.accountName ? (
                            <Link
                              href={`/conti/${m.accountId}`}
                              className="inline-flex items-center gap-1.5 hover:text-primary"
                              title={`Vai al conto ${m.accountName}`}
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: m.accountColor ?? "#a1a1aa" }}
                              />
                              <span className="text-foreground truncate max-w-32">
                                {m.accountName}
                              </span>
                              {m.isTransfer && (
                                <ArrowLeftRight
                                  className="h-3 w-3 text-muted-foreground shrink-0"
                                  aria-label="Trasferimento tra conti"
                                />
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground">{m.description}</td>
                        <td className="px-4 py-3">
                          <InlineCategoryEditor
                            movementId={m.id}
                            currentCategoryId={m.categoryId}
                            currentCategoryName={m.categoryName}
                            currentCategoryColor={m.categoryColor}
                            movementType={m.type}
                            categories={cats.map((c) => ({
                              id: c.id,
                              name: c.name,
                              type: c.type,
                              color: c.color,
                            }))}
                          />
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {m.employeeFirstName ? (
                            `${m.employeeLastName} ${m.employeeFirstName}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right font-medium tabular-nums " +
                            (isIncome ? "text-success" : "text-danger")
                          }
                        >
                          {isIncome ? "+" : "−"}
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/movimenti/${m.id}/modifica`}>
                              <Button variant="ghost" size="icon" aria-label="Modifica">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <form action={deleteMovementAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <Button
                                variant="ghost"
                                size="icon"
                                type="submit"
                                aria-label="Elimina"
                                className="text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Costruisce una querystring con i filtri attivi MENO il `month` (che varia
 * navigando fra i mesi). Serve a preservare gli altri filtri quando si entra
 * nel dettaglio di un mese o si naviga tra mesi.
 */
function buildExtraQs(filters: {
  type: "income" | "expense" | undefined;
  categoryIds: string[];
  accountId: string | undefined;
  search: string | undefined;
}): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.search) params.set("search", filters.search);
  for (const id of filters.categoryIds) params.append("categoryIds", id);
  return params.toString();
}
