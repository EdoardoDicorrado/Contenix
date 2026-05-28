"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCategory } from "@/lib/db/queries/categories";

const InlineCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type InlineCreateResult =
  | { ok: true; category: { id: string; name: string; type: "income" | "expense"; color: string | null } }
  | { ok: false; error: string };

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#f97316", "#eab308",
  "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16", "#a3a3a3",
];

export async function createCategoryInlineAction(
  payload: unknown,
): Promise<InlineCreateResult> {
  const parsed = InlineCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Nome categoria non valido" };
  }

  try {
    const color = parsed.data.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    const cat = await createCategory({
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      color,
    });
    revalidatePath("/categorie");
    revalidatePath("/movimenti");
    return {
      ok: true,
      category: {
        id: cat.id,
        name: cat.name,
        type: cat.type,
        color: cat.color,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore creazione categoria",
    };
  }
}
