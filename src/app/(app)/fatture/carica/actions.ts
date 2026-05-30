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
  status: "created" | "stub" | "duplicate" | "error" | "skipped";
  invoiceId?: string;
  invoiceNumber?: string;
  counterparty?: string;
  totalAmount?: string;
  type?: "purchase" | "sale";
  /** Data emissione della fattura (utile per calcolare il periodo coperto) */
  issueDate?: string;
  error?: string;
};

export type UploadResult = {
  ok: boolean;
  files: UploadFileResult[];
  totalCreated: number;
  totalStub: number;
  totalDuplicates: number;
  totalErrors: number;
  totalSkipped: number;
  /** Conteggi separati emesse / ricevute (solo per i created/stub di questo run). */
  totalSales: number;
  totalPurchases: number;
  /** Range issueDate (ISO YYYY-MM-DD) delle fatture create/stub in questo run. */
  periodFrom: string | null;
  periodTo: string | null;
  /** Risultato dell'auto-match silenzioso eseguito a fine import. */
  autoMatch?: {
    autoMatched: number;
    aggregateMatched: number;
    needsReview: number;
  };
};

/**
 * Riconosce i file di accompagnamento SDI (metadati, notifiche, ricevute)
 * che NON sono fatture. Filtrarli evita parsing inutile e errori a cascata.
 *
 * Pattern coperti:
 *  - Nomi con "metadata" / "metadati" (es. *_metadati.xml)
 *  - Prefisso SDI a 2 lettere seguito da "_": MT, NS, NE, RC, MC, NR, DT, AT, SE, EC, DF
 *    (rispettivamente: MetadatiTrasmissione, NotificaScarto, NotificaEsito,
 *     RicevutaConsegna, MancataConsegna, NotificaRifiuto, DecorrenzaTermini,
 *     AttestazioneTrasmissione, ScartoEsito, EsitoCommittente, DataFile)
 */
function isSdiMetadataFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("metadata") || lower.includes("metadati")) return true;
  const sdiPrefixes = ["mt_", "ns_", "ne_", "rc_", "mc_", "nr_", "dt_", "at_", "se_", "ec_", "df_"];
  const bare = name.split("/").pop()?.toLowerCase() ?? lower;
  return sdiPrefixes.some((p) => bare.startsWith(p));
}

type FileEntry = {
  name: string;
  data: Buffer;
};

export async function uploadFilesAction(formData: FormData): Promise<UploadResult> {
  const ourVat = (formData.get("ourVat") as string) || undefined;
  const rawType = (formData.get("defaultType") as string) || "";
  const defaultType: "purchase" | "sale" | undefined =
    rawType === "purchase" || rawType === "sale" ? rawType : undefined;
  const isForeign = formData.get("mode") === "estero";

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) files.push(value);
  }
  if (files.length === 0) {
    return {
      ok: false,
      files: [],
      totalCreated: 0,
      totalStub: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      totalSkipped: 0,
      totalSales: 0,
      totalPurchases: 0,
      periodFrom: null,
      periodTo: null,
    };
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
          const fileName = path.split("/").pop() ?? path;
          // Skip dei file di accompagnamento SDI: non sono fatture
          if (isSdiMetadataFile(fileName)) {
            results.push({ fileName, status: "skipped" });
            continue;
          }
          const inner = await entry.async("nodebuffer");
          flat.push({ name: fileName, data: inner });
        }
      } catch (e) {
        results.push({
          fileName: f.name,
          status: "error",
          error: e instanceof Error ? `ZIP non leggibile: ${e.message}` : "ZIP non leggibile",
        });
      }
    } else if (isSdiMetadataFile(f.name)) {
      results.push({ fileName: f.name, status: "skipped" });
    } else {
      flat.push({ name: f.name, data: buf });
    }
  }

  for (const entry of flat) {
    try {
      const result = await processSingleFile(entry, ourVat, defaultType, isForeign);
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

  // Calcola periodo coperto e conteggi tipo dalle fatture create/stub
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let totalSales = 0;
  let totalPurchases = 0;
  for (const r of results) {
    if (r.status !== "created" && r.status !== "stub") continue;
    if (r.type === "sale") totalSales += 1;
    else if (r.type === "purchase") totalPurchases += 1;
    if (r.issueDate) {
      if (!periodFrom || r.issueDate < periodFrom) periodFrom = r.issueDate;
      if (!periodTo || r.issueDate > periodTo) periodTo = r.issueDate;
    }
  }

  // Auto-trigger silenzioso: se abbiamo importato fatture, prova l'auto-match.
  // Best-effort: errori non bloccano il risultato dell'upload.
  let autoMatch: UploadResult["autoMatch"] = undefined;
  const created = results.filter((r) => r.status === "created" || r.status === "stub").length;
  if (created > 0) {
    try {
      const { applyInvoiceMatches } = await import(
        "@/lib/db/queries/apply-invoice-matches"
      );
      const am = await applyInvoiceMatches();
      autoMatch = {
        autoMatched: am.autoMatched,
        aggregateMatched: am.aggregateMatched,
        needsReview: am.needsReview,
      };
    } catch {
      // niente toast specifico — l'utente può lanciare manualmente da /sincronizza
    }
  }

  return {
    ok: true,
    files: results,
    totalCreated: results.filter((r) => r.status === "created").length,
    totalStub: results.filter((r) => r.status === "stub").length,
    totalDuplicates: results.filter((r) => r.status === "duplicate").length,
    totalErrors: results.filter((r) => r.status === "error").length,
    totalSkipped: results.filter((r) => r.status === "skipped").length,
    totalSales,
    totalPurchases,
    periodFrom,
    periodTo,
    autoMatch,
  };
}

async function processSingleFile(
  entry: FileEntry,
  ourVat?: string,
  defaultType?: "purchase" | "sale",
  isForeign?: boolean,
): Promise<UploadFileResult> {
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
    return await createInvoiceFromXml(entry, hash, mime, parsed.data, defaultType);
  }

  if (kind === "pdf") {
    return await createStubFromPdf(entry, hash, mime, defaultType, isForeign);
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
  defaultType?: "purchase" | "sale",
): Promise<UploadFileResult> {
  const blob = await uploadInvoiceFile({
    fileName: entry.name,
    contentType: mime,
    data: entry.data,
  });

  // Se l'utente ha forzato un tipo (Emesse / Ricevute), vince sull'auto-detect.
  const effectiveType = defaultType ?? data.type;

  const [row] = await db
    .insert(invoices)
    .values({
      number: data.number,
      type: effectiveType,
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
    issueDate: row.issueDate.toISOString().slice(0, 10),
  };
}

async function createStubFromPdf(
  entry: FileEntry,
  hash: string,
  mime: string,
  defaultType?: "purchase" | "sale",
  isForeign?: boolean,
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
      type: defaultType ?? "purchase",
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
      // `foreign_pdf` discrimina le fatture estere dalle PDF cassetto cartacee.
      // Niente migrazione DB: il campo è varchar.
      extractionStatus: isForeign ? "foreign_pdf" : "pending_ai",
    })
    .returning();

  return {
    fileName: entry.name,
    status: "stub",
    invoiceId: row.id,
    invoiceNumber: row.number,
    counterparty: row.counterpartyName,
    type: row.type,
    issueDate: row.issueDate.toISOString().slice(0, 10),
  };
}
