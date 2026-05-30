import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CategoryForm } from "../../category-form";
import { updateCategoryAction } from "../../actions";
import { getCategory } from "@/lib/db/queries/categories";

export default async function ModificaCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cat = await getCategory(id);
  if (!cat) notFound();

  const boundAction = updateCategoryAction.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/categorie"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Categorie
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Modifica categoria</h2>
      </div>
      <CategoryForm
        action={boundAction}
        defaultValues={{
          name: cat.name,
          type: cat.type,
          color: cat.color ?? "#6b7280",
        }}
        submitLabel="Salva modifiche"
      />
    </div>
  );
}
