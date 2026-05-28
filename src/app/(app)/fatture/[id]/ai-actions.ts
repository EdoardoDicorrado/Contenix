"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { head } from "@vercel/blob";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { extractInvoiceFromPdf } from "@/lib/ai-extract";

export type AiExtractResult =
  | { ok: true; cost: number; tokens: number; cacheHit: boolean }
  | { ok: false; error: string };

export async function extractInvoiceWithAiAction(
  formData: FormData,
): Promise<AiExtractResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "ID fattura mancante" };

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return { ok: false, error: "Fattura non trovata" };

  if (!invoice.fileUrl) {
    return { ok: false, error: "Questa fattura non ha un file allegato" };
  }
  if (invoice.fileMime !== "application/pdf") {
    return { ok: false, error: "L'estrazione AI funziona solo su file PDF" };
  }
  // Le fatture XML sono già complete deterministicamente — vietare ri-estrazione AI
  if (invoice.extractionStatus === "xml") {
    return {
      ok: false,
      error: "Questa fattura ha dati XML completi, non serve estrarre con AI.",
    };
  }
  // Permettiamo ri-estrazione per status "pending_ai" e "ai" (riprocessare con prompt aggiornato)

  // Fetch del file dal Blob privato
  let pdfBuffer: Buffer;
  try {
    const blobInfo = await head(invoice.fileUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const downloadUrl = (blobInfo as { downloadUrl?: string }).downloadUrl ?? invoice.fileUrl;
    const res = await fetch(downloadUrl, {
      headers: process.env.BLOB_READ_WRITE_TOKEN
        ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        : undefined,
    });
    if (!res.ok) {
      return { ok: false, error: `Impossibile leggere il file dallo storage (${res.status})` };
    }
    const arrayBuf = await res.arrayBuffer();
    pdfBuffer = Buffer.from(arrayBuf);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? `Errore lettura file: ${e.message}` : "Errore lettura file dallo storage",
    };
  }

  // Chiamata Claude API
  const result = await extractInvoiceFromPdf(pdfBuffer);
  if (!result.ok) return { ok: false, error: result.error };

  const { data, usage } = result;

  // Update fattura con i dati estratti
  try {
    await db
      .update(invoices)
      .set({
        number: data.number,
        // Manteniamo il type esistente (purchase di default per gli stub PDF) —
        // l'AI non può sapere quale lato sia "noi" senza la P.IVA aziendale
        counterpartyName: data.counterpartyName,
        counterpartyVat: data.counterpartyVat,
        issueDate: new Date(data.issueDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        totalAmount: data.totalAmount.toFixed(2),
        vatAmount: data.vatAmount != null ? data.vatAmount.toFixed(2) : null,
        currency: data.currency,
        description: data.description?.slice(0, 2000) ?? null,
        paymentIban: data.paymentIban?.replace(/\s+/g, "").toUpperCase().slice(0, 34) ?? null,
        documentType: data.documentType?.toUpperCase().slice(0, 4) ?? null,
        paymentMethod: data.paymentMethod?.toUpperCase().slice(0, 4) ?? null,
        isCreditNote:
          data.documentType?.toUpperCase() === "TD04" ||
          data.documentType?.toUpperCase() === "TD08",
        extractionStatus: "ai",
        parsedData: {
          extractedAt: new Date().toISOString(),
          confidence: data.confidence,
          notes: data.notes,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheCreationTokens: usage.cacheCreationTokens,
            cacheReadTokens: usage.cacheReadTokens,
            costUsd: usage.costUsd,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id));
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Errore salvataggio: ${e.message}` : "Errore salvataggio fattura",
    };
  }

  revalidatePath(`/fatture/${id}`);
  revalidatePath("/fatture");
  revalidatePath("/");

  return {
    ok: true,
    cost: usage.costEur,
    tokens: usage.inputTokens + usage.outputTokens,
    cacheHit: usage.cacheReadTokens > 0,
  };
}
