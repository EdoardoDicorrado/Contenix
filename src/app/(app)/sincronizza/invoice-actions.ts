"use server";

import { revalidatePath } from "next/cache";
import {
  applyInvoiceMatches,
  type ApplyInvoiceMatchesResult,
} from "@/lib/db/queries/apply-invoice-matches";

export type ApplyInvoiceMatchesActionResult =
  | { ok: true; result: ApplyInvoiceMatchesResult }
  | { ok: false; error: string };

export async function applyInvoiceMatchesAction(): Promise<ApplyInvoiceMatchesActionResult> {
  try {
    const result = await applyInvoiceMatches();
    revalidatePath("/sincronizza");
    revalidatePath("/fatture");
    revalidatePath("/movimenti");
    revalidatePath("/");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore sconosciuto",
    };
  }
}
