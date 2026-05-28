"use server";

import { revalidatePath } from "next/cache";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { uploadInvoiceFile } from "@/lib/blob";
import { sha256, detectMime, fileKind } from "@/lib/file-utils";
import { parseFatturaPAServer } from "@/lib/fatturapa-server";
import type { FatturaPAExtraction } from "@/lib/fatturapa-parser";

export type UploadFileResult = {
  fileName: string;
  status: "created" | "stub" | "duplicate" | "error";
  invoiceId?: string;
  invoiceNumber?: string;
  counterparty?: string;
  totalAmount?: string;
  type?: "purchase" | "sale";
  error?: string;
};

export type UploadResult = {
  ok: boolean;
  files: UploadFileResult[];
  totalCreated: number;
  totalStub: number;
  totalDuplicates: number;
  totalErrors: number;
};

type FileEntry = {
  name: string;
  data: Buffer;
};

export async function uploadFilesAction(formData: FormData): Promise<UploadResult> {
  const ourVat = (formData.get("ourVat") as string) || undefined;

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) files.push(value);
  }
  if (files.length === 0) {
    return { ok: false, files: [], totalCreated: 0, totalStub: 0, totalDuplicates: 0, totalErrors: 0 };
  }

  const results: UploadFileResult[] = [];

  // Espandi ZIP in entry singole
  const flat: FileEntry[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const kind = fileKind(f.name, detectMime(f.name, f.type));
    if (kind === "zip") {
      try {
        const zip = await JSZip.loadAsync(buf);
        for (const [path, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          if (path.startsWith("__MACOSX/")) continue;
          const inner = await entry.async("nodebuffer");
          flat.push({ name: path.split("/").pop() ?? path, data: inner });
        }
      } catch (e) {
        results.push({
          fileName: f.name,
          status: "error",
          error: e instanceof Error ? `ZIP non leggibile: ${e.message}` : "ZIP non leggibile",
        });
      }
    } else {
      flat.push({ name: f.name, data: buf });
    }
  }

  for (const entry of flat) {
    try {
      const result = await processSingleFile(entry, ourVat);
      results.push(result);
    } catch (e) {
      results.push({
        fileName: entry.name,
        status: "error",
        error: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  }

  revalidatePath("/fatture");
  revalidatePath("/");

  return {
    ok: true,
    files: results,
    totalCreated: results.filter((r) => r.status === "created").length,
    totalStub: results.filter((r) => r.status === "stub").length,
    totalDuplicates: results.filter((r) => r.status === "duplicate").length,
    totalErrors: results.filter((r) => r.status === "error").length,
  };
}

async function processSingleFile(entry: FileEntry, ourVat?: string): Promise<UploadFileResult> {
  const hash = sha256(entry.data);

  // Dedup: c'è già una fattura con lo stesso hash?
  const [existing] = await db
    .select({ id: invoices.id, number: invoices.number, counterpartyName: invoices.counterpartyName })
    .from(invoices)
    .where(eq(invoices.fileHash, hash))
    .limit(1);

  if (existing) {
    return {
      fileName: entry.name,
      status: "duplicate",
      invoiceId: existing.id,
      invoiceNumber: existing.number,
      counterparty: existing.counterpartyName,
    };
  }

  const mime = detectMime(entry.name);
  const kind = fileKind(entry.name, mime);

  if (kind === "xml") {
    const xmlText = entry.data.toString("utf-8").replace(/^﻿/, "");
    const parsed = parseFatturaPAServer(xmlText, ourVat);
    if (!parsed.ok) {
      return { fileName: entry.name, status: "error", error: parsed.error };
    }
    return await createInvoiceFromXml(entry, hash, mime, parsed.data);
  }

  if (kind === "pdf") {
    return await createStubFromPdf(entry, hash, mime);
  }

  return {
    fileName: entry.name,
    status: "error",
    error: "Formato non supportato (usa XML, PDF o ZIP)",
  };
}

async function createInvoiceFromXml(
  entry: FileEntry,
  hash: string,
  mime: string,
  data: FatturaPAExtraction,
): Promise<UploadFileResult> {
  const blob = await uploadInvoiceFile({
    fileName: entry.name,
    contentType: mime,
    data: entry.data,
  });

  const [row] = await db
    .insert(invoices)
    .values({
      number: data.number,
      type: data.type,
      counterpartyName: data.counterpartyName,
      counterpartyVat: data.counterpartyVat,
      issueDate: new Date(data.issueDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      totalAmount: data.totalAmount,
      vatAmount: data.vatAmount,
      currency: data.currency,
      status: "pending",
      description: data.description,
      paymentIban: data.paymentIban,
      documentType: data.documentType,
      paymentMethod: data.paymentMethod,
      // FatturaPA: TD04 = nota di credito, TD05 = nota di debito (trattata anch'essa come storno)
      isCreditNote: data.documentType === "TD04" || data.documentType === "TD08",
      fileUrl: blob.url,
      fileName: entry.name,
      fileHash: hash,
      fileSize: blob.size,
      fileMime: mime,
      extractionStatus: "xml",
      parsedData: { sender: data.sender, recipient: data.recipient },
    })
    .returning();

  return {
    fileName: entry.name,
    status: "created",
    invoiceId: row.id,
    invoiceNumber: row.number,
    counterparty: row.counterpartyName,
    totalAmount: row.totalAmount,
    type: row.type,
  };
}

async function createStubFromPdf(
  entry: FileEntry,
  hash: string,
  mime: string,
): Promise<UploadFileResult> {
  const blob = await uploadInvoiceFile({
    fileName: entry.name,
    contentType: mime,
    data: entry.data,
  });

  const stubNumber = `BOZZA-${hash.slice(0, 8)}`;
  const today = new Date();

  const [row] = await db
    .insert(invoices)
    .values({
      number: stubNumber,
      type: "purchase",
      counterpartyName: "Da completare",
      counterpartyVat: null,
      issueDate: today,
      dueDate: null,
      totalAmount: "0.00",
      vatAmount: null,
      currency: "EUR",
      status: "pending",
      fileUrl: blob.url,
      fileName: entry.name,
      fileHash: hash,
      fileSize: blob.size,
      fileMime: mime,
      extractionStatus: "pending_ai",
    })
    .returning();

  return {
    fileName: entry.name,
    status: "stub",
    invoiceId: row.id,
    invoiceNumber: row.number,
    counterparty: row.counterpartyName,
    type: row.type,
  };
}
