"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "@/lib/db/queries/employees";

const EmployeeSchema = z.object({
  firstName: z.string().min(1, "Nome obbligatorio").max(100),
  lastName: z.string().min(1, "Cognome obbligatorio").max(100),
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
  active: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export type EmployeeFormState =
  | { ok: false; errors: Record<string, string> }
  | { ok: true }
  | null;

function flattenZodErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

function parseFormData(formData: FormData) {
  const raw = {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim() || undefined,
    fiscalCode: String(formData.get("fiscalCode") ?? "").trim().toUpperCase() || undefined,
    role: String(formData.get("role") ?? "").trim() || undefined,
    hiredAt: String(formData.get("hiredAt") ?? "").trim() || undefined,
    monthlyCost: String(formData.get("monthlyCost") ?? "").replace(",", ".").trim() || undefined,
    active: (formData.get("active") as string) ?? undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };
  return EmployeeSchema.safeParse(raw);
}

function toEmployeeInput(data: z.infer<typeof EmployeeSchema>) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email ?? null,
    fiscalCode: data.fiscalCode ?? null,
    role: data.role ?? null,
    hiredAt: data.hiredAt ? new Date(data.hiredAt) : null,
    monthlyCost: data.monthlyCost ? parseFloat(data.monthlyCost).toFixed(2) : null,
    active: data.active === "on" || data.active === "true",
    notes: data.notes ?? null,
  };
}

export async function createEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) return { ok: false, errors: flattenZodErrors(parsed.error) };
  await createEmployee(toEmployeeInput(parsed.data));
  revalidatePath("/dipendenti");
  redirect("/dipendenti");
}

export async function updateEmployeeAction(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) return { ok: false, errors: flattenZodErrors(parsed.error) };
  await updateEmployee(id, toEmployeeInput(parsed.data));
  revalidatePath("/dipendenti");
  redirect("/dipendenti");
}

export async function deleteEmployeeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteEmployee(id);
  revalidatePath("/dipendenti");
}
