"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createEmployee } from "@/lib/db/queries/employees";

const InlineEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z
    .string()
    .max(255)
    .optional()
    .refine((v) => !v || /^[^@]+@[^@]+\.[^@]+$/.test(v), {
      message: "Email non valida",
    }),
  fiscalCode: z.string().max(16).optional(),
  role: z.string().max(100).optional(),
  hiredAt: z.string().optional(),
  monthlyCost: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), {
      message: "Costo deve essere un numero positivo",
    }),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export type InlineEmployeeResult =
  | {
      ok: true;
      employee: {
        id: string;
        firstName: string;
        lastName: string;
      };
    }
  | { ok: false; error: string };

export async function createEmployeeInlineAction(
  payload: unknown,
): Promise<InlineEmployeeResult> {
  const parsed = InlineEmployeeSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  try {
    const e = await createEmployee({
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      email: parsed.data.email ?? null,
      fiscalCode: parsed.data.fiscalCode ?? null,
      role: parsed.data.role ?? null,
      hiredAt: parsed.data.hiredAt ? new Date(parsed.data.hiredAt) : null,
      monthlyCost: parsed.data.monthlyCost ?? null,
      active: parsed.data.active ?? true,
      notes: parsed.data.notes ?? null,
    });
    revalidatePath("/dipendenti");
    return {
      ok: true,
      employee: { id: e.id, firstName: e.firstName, lastName: e.lastName },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Errore creazione dipendente",
    };
  }
}
