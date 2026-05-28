"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/lib/db/queries/financial-accounts";

const AccountTypeEnum = z.enum(["bank", "credit_card", "wallet", "cash", "other"]);

const AccountSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  type: AccountTypeEnum,
  currency: z.string().length(3, "Valuta deve essere 3 lettere"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido")
    .optional()
    .nullable(),
  identifier: z.string().max(30).optional().nullable(),
  openingBalance: z
    .string()
    .refine((v) => !isNaN(parseFloat(v)), { message: "Saldo iniziale non valido" })
    .default("0"),
  notes: z.string().max(2000).optional().nullable(),
  isPrimary: z.string().optional(), // checkbox "on"
  isActive: z.string().optional(), // checkbox "on"
});

export type AccountFormState =
  | { ok: false; errors: Record<string, string> }
  | { ok: true; id: string }
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
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    color: (formData.get("color") as string) || null,
    identifier: String(formData.get("identifier") ?? "").trim() || null,
    openingBalance: String(formData.get("openingBalance") ?? "0").replace(",", "."),
    notes: String(formData.get("notes") ?? "").trim() || null,
    isPrimary: (formData.get("isPrimary") as string) || undefined,
    isActive: (formData.get("isActive") as string) || undefined,
  };
  return AccountSchema.safeParse(raw);
}

function toInput(data: z.infer<typeof AccountSchema>) {
  return {
    name: data.name,
    type: data.type,
    currency: data.currency,
    color: data.color ?? null,
    identifier: data.identifier ?? null,
    openingBalance: parseFloat(data.openingBalance).toFixed(2),
    notes: data.notes ?? null,
    isPrimary: data.isPrimary === "on" || data.isPrimary === "true",
    isActive: data.isActive === "on" || data.isActive === "true",
  };
}

export async function createAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };

  try {
    // I conti creati sono sempre attivi. Il toggle "attivo/inattivo" esiste
    // solo nel form di modifica.
    await createAccount({ ...toInput(parsed.data), isActive: true });
  } catch (e) {
    return {
      ok: false,
      errors: { _: e instanceof Error ? e.message : "Errore creazione conto" },
    };
  }

  revalidatePath("/conti");
  revalidatePath("/movimenti");
  revalidatePath("/");
  // redirect() lancia NEXT_REDIRECT — il return type è soddisfatto
  redirect("/conti");
}

export async function updateAccountAction(
  id: string,
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };

  try {
    await updateAccount(id, toInput(parsed.data));
  } catch (e) {
    return {
      ok: false,
      errors: { _: e instanceof Error ? e.message : "Errore aggiornamento conto" },
    };
  }

  revalidatePath("/conti");
  revalidatePath(`/conti/${id}`);
  revalidatePath("/movimenti");
  revalidatePath("/");
  redirect(`/conti/${id}`);
}

export async function deleteAccountAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteAccount(id);
    revalidatePath("/conti");
    revalidatePath("/movimenti");
    revalidatePath("/");
  } catch {
    // se ha movimenti associati il delete restrict fallirà - silent fail,
    // l'utente vedrà che il conto è ancora lì (mostriamo error toast in F1.5)
  }
  redirect("/conti");
}
