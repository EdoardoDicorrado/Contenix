"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  applyEmployeeAllocation,
  type ApplyEmployeeResult,
} from "@/lib/db/queries/apply-employee-allocation";

const ApplyEmployeeSchema = z.object({
  overrideExisting: z.boolean(),
});

export type ApplyEmployeeActionResult =
  | { ok: true; result: ApplyEmployeeResult }
  | { ok: false; error: string };

export async function applyEmployeeAllocationAction(
  input: z.infer<typeof ApplyEmployeeSchema>,
): Promise<ApplyEmployeeActionResult> {
  const parsed = ApplyEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Parametri non validi" };
  }
  try {
    const result = await applyEmployeeAllocation(parsed.data);
    revalidatePath("/sincronizza");
    revalidatePath("/movimenti");
    revalidatePath("/dipendenti");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore sconosciuto",
    };
  }
}
