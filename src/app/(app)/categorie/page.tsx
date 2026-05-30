import { EmptyState } from "@/components/ui/empty-state";
import { listCategoriesWithStats } from "@/lib/db/queries/categories";
import { getMovementsStats } from "@/lib/db/queries/movements";
import {
  describePeriod,
  periodFromSearchParams,
  periodToWindow,
} from "@/lib/period";
import { CategoriesView } from "./categories-view";
import { NewCategoryButton } from "./new-category-button";
import { SyncCategoriesButton } from "../sincronizza/sync-buttons";

type SP = Promise<{
  period?: string;
  month?: string;
  from?: string;
  to?: string;
}>;

export default async function CategoriePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const period = periodFromSearchParams(sp);
  const window = periodToWindow(period);
  const [rows, movStats] = await Promise.all([
    listCategoriesWithStats(window),
    getMovementsStats(),
  ]);
  const income = rows.filter((r) => r.type === "income");
  const expense = rows.filter((r) => r.type === "expense");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Categorie</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} categorie totali · {expense.length} uscite · {income.length} entrate.
            Click su una card per vedere i movimenti.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncCategoriesButton stats={movStats} />
          <NewCategoryButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna categoria"
          description="Crea categorie per organizzare entrate e uscite (es. Vendite, Stipendi, Affitto)."
          action={<NewCategoryButton />}
        />
      ) : (
        <CategoriesView
          categories={rows.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            color: c.color,
            movementsCount: c.movementsCount,
            total: c.total,
            rulesCount: c.rulesCount,
            lastMovementAt: c.lastMovementAt,
          }))}
          initialPeriod={period}
          periodLabel={describePeriod(period)}
        />
      )}
    </div>
  );
}
