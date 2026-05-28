import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategoryForm } from "../category-form";
import { createCategoryAction } from "../actions";

export default function NuovaCategoriaPage() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/categorie"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Categorie
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Nuova categoria</h2>
      </div>
      <CategoryForm action={createCategoryAction} submitLabel="Crea categoria" />
    </div>
  );
}
