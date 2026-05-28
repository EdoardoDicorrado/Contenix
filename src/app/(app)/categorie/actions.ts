"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db/queries/categories";

const CategorySchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  type: z.enum(["income", "expense"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colore deve essere hex (es. #2563eb)"),
});

export type CategoryFormState =
  | { ok: false; errors: Record<string, string> }
  | { ok: true }
  | null;

function flatten(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const p = i.path.join(".");
    if (!out[p]) out[p] = i.message;
  }
  return out;
}

function parse(formData: FormData) {
  return CategorySchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
    color: String(formData.get("color") ?? "").trim(),
  });
}

export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };
  await createCategory(parsed.data);
  revalidatePath("/categorie");
  revalidatePath("/movimenti");
  redirect("/categorie");
}

export async function updateCategoryAction(
  id: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };
  await updateCategory(id, parsed.data);
  revalidatePath("/categorie");
  revalidatePath("/movimenti");
  redirect("/categorie");
}

export async function deleteCategoryAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteCategory(id);
  revalidatePath("/categorie");
  revalidatePath("/movimenti");
}
