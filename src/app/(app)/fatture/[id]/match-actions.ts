"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { createMatch, deleteMatch, getMatchedTotal } from "@/lib/db/queries/matches";

const LinkSchema = z.object({
  invoiceId: z.string().uuid(),
  movementId: z.string().uuid(),
  matchedAmount: z
    .string()
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Importo deve essere positivo",
    }),
});

async function syncInvoiceStatus(invoiceId: string) {
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) return;

  // Non toccare fatture annullate
  if (inv.status === "cancelled") return;

  const total = parseFloat(inv.totalAmount);
  const matched = await getMatchedTotal(invoiceId);

  let newStatus: "pending" | "partial" | "paid";
  if (Math.abs(matched - total) < 0.01) newStatus = "paid";
  else if (matched > 0.01) newStatus = "partial";
  else newStatus = "pending";

  if (newStatus !== inv.status) {
    await db
      .update(invoices)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  }
}

export async function linkMovementAction(formData: FormData) {
  const parsed = LinkSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    movementId: formData.get("movementId"),
    matchedAmount: String(formData.get("matchedAmount") ?? "").replace(",", "."),
  });
  if (!parsed.success) return;

  await createMatch({
    invoiceId: parsed.data.invoiceId,
    movementId: parsed.data.movementId,
    matchedAmount: parseFloat(parsed.data.matchedAmount).toFixed(2),
    matchType: "manual",
  });

  await syncInvoiceStatus(parsed.data.invoiceId);

  revalidatePath(`/fatture/${parsed.data.invoiceId}`);
  revalidatePath("/fatture");
  revalidatePath("/");
}

export async function unlinkMatchAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!id) return;
  await deleteMatch(id);
  if (invoiceId) {
    await syncInvoiceStatus(invoiceId);
    revalidatePath(`/fatture/${invoiceId}`);
    revalidatePath("/fatture");
    revalidatePath("/");
  }
}
