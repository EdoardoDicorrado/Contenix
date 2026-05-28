import { EmptyState } from "@/components/ui/empty-state";
import { listCategoriesWithStats } from "@/lib/db/queries/categories";
import { CategoriesView } from "./categories-view";
import { NewCategoryButton } from "./new-category-button";

export default async function CategoriePage() {
  const rows = await listCategoriesWithStats();
  const income = rows.filter((r) => r.type === "income");
  const expense = rows.filter((r) => r.type === "expense");

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Categorie</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} categorie totali · {expense.length} uscite · {income.length} entrate.
            Click su una card per vedere i movimenti di quella categoria.
          </p>
        </div>
        <NewCategoryButton />
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
        />
      )}
    </div>
  );
}
