"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAccount } from "@/lib/db/queries/financial-accounts";

const InlineAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["bank", "credit_card", "wallet", "cash", "other"]),
  currency: z.string().length(3).default("EUR"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  identifier: z.string().max(30).optional(),
  openingBalance: z
    .string()
    .refine((v) => !isNaN(parseFloat(v)), { message: "Saldo iniziale non valido" })
    .default("0"),
  isPrimary: z.boolean().optional(),
});

export type InlineAccountResult =
  | { ok: true; account: { id: string; name: string } }
  | { ok: false; error: string };

export async function createAccountInlineAction(
  payload: unknown,
): Promise<InlineAccountResult> {
  const parsed = InlineAccountSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  try {
    const a = await createAccount({
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      currency: parsed.data.currency.toUpperCase(),
      color: parsed.data.color ?? null,
      identifier: parsed.data.identifier ?? null,
      openingBalance: parsed.data.openingBalance,
      notes: null,
      isPrimary: parsed.data.isPrimary ?? false,
      isActive: true,
    });
    revalidatePath("/conti");
    revalidatePath("/movimenti");
    return { ok: true, account: { id: a.id, name: a.name } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore creazione conto",
    };
  }
}
