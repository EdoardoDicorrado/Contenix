import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewMovementButton } from "./new-movement-button";
import { getPrimaryAccount } from "@/lib/db/queries/financial-accounts";
import { EmptyState } from "@/components/ui/empty-state";
import {
  countUncategorizedMovements,
  getMovementsStats,
  listMonthlyAggregates,
  listMovements,
} from "@/lib/db/queries/movements";
import { SyncCategoriesButton } from "../sincronizza/sync-buttons";
import { listCategories } from "@/lib/db/queries/categories";
import { listAccounts } from "@/lib/db/queries/financial-accounts";
import { listEmployees } from "@/lib/db/queries/employees";
import {
  periodFromSearchParams,
  periodToWindow,
} from "@/lib/period";
import { FilterBar } from "./filter-bar";
import { MonthlyCards } from "./monthly-cards";
import { MonthNavigation } from "./month-navigation";
import { EditableMovementRow } from "./editable-movement-row";

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

  // Vista tabella movimenti SOLO per "mese specifico". Tutti gli altri periodi
  // (quarter / half-year / ytd / year / full-year / range / all) mostrano la
  // vista a card mensili filtrata al periodo selezionato.
  const showMonthDetail = period.kind === "month";

  const extraQs = buildExtraQs({ type, categoryIds, accountId, search });

  // Caricamento condizionale per evitare query inutili
  const wantsMovements = showMonthDetail;
  const [
    cats,
    accounts,
    uncategorizedCount,
    monthlyData,
    movs,
    primaryAccount,
    movStats,
    employeesAll,
  ] = await Promise.all([
    listCategories(),
    listAccounts({ activeOnly: false }),
    countUncategorizedMovements(),
    // Aggregati per le card: filtra al periodo se specificato (quarter/ytd/range/...)
    listMonthlyAggregates({ type, categoryIds, accountId, search, from, to }),
    wantsMovements
      ? listMovements({ type, categoryIds, accountId, search, from, to })
      : Promise.resolve([] as Awaited<ReturnType<typeof listMovements>>),
    getPrimaryAccount(),
    getMovementsStats(),
    listEmployees(false),
  ]);

  return (
    <div className="flex flex-col gap-4">
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
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                {uncategorizedCount} da rivedere
              </Button>
            </Link>
          )}
          <SyncCategoriesButton stats={movStats} />
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
            employees={employeesAll.map((e) => ({
              id: e.id,
              firstName: e.firstName,
              lastName: e.lastName,
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
        <MonthlyCards
          data={monthlyData}
          extraQs={extraQs}
          filters={{ type, accountId, categoryIds, search }}
        />
      ) : (
        <>
          {showMonthDetail && period.month && (
            <MonthNavigation
              currentMonth={period.month}
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
                    <th className="text-left font-medium px-4 py-2.5">Match fattura</th>
                    <th className="text-right font-medium px-4 py-2.5">Importo</th>
                    <th className="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movs.map((m) => (
                    <EditableMovementRow
                      key={m.id}
                      movement={m}
                      categories={cats.map((c) => ({
                        id: c.id,
                        name: c.name,
                        type: c.type,
                        color: c.color,
                      }))}
                      employees={employeesAll.map((e) => ({
                        id: e.id,
                        firstName: e.firstName,
                        lastName: e.lastName,
                      }))}
                      accounts={accounts.map((a) => ({
                        id: a.id,
                        name: a.name,
                        type: a.type,
                        isPrimary: a.isPrimary,
                        color: a.color,
                      }))}
                    />
                  ))}
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
