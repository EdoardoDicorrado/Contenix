"use server";

import { revalidatePath } from "next/cache";
import { deleteRule } from "@/lib/db/queries/categorization-rules";

export async function deleteRuleAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteRule(id);
  revalidatePath("/categorie");
}
