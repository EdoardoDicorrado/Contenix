import { NextResponse } from "next/server";
import JSZip from "jszip";
import { head } from "@vercel/blob";
import { listForeignInvoices } from "@/lib/db/queries/invoices";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60; // ZIP grandi possono richiedere più tempo

/**
 * Esporta tutte le fatture estere in un unico ZIP che contiene:
 *  - Una cartella per ogni fattura (`NUMERO_CONTROPARTE/`) con dentro il PDF
 *  - Un file `riepilogo.csv` in root con tutti i dati tabellari
 *
 * Lo ZIP viene costruito in-memory e restituito come stream.
 */
export async function GET() {
  const invoices = await listForeignInvoices();
  const withFile = invoices.filter((i) => !!i.fileUrl);

  if (withFile.length === 0) {
    return NextResponse.json(
      { error: "Nessuna fattura estera con file allegato" },
      { status: 404 },
    );
  }

  const zip = new JSZip();

  // Riepilogo CSV (separatore `;` per compatibilità Excel italiano)
  const csvRows: string[] = [
    [
      "Numero",
      "Tipo",
      "Controparte",
      "P.IVA",
      "Data emissione",
      "Scadenza",
      "Totale",
      "Valuta",
      "Stato",
      "File",
    ].join(";"),
  ];

  for (const inv of withFile) {
    const safeNumber = sanitizeForFs(inv.number);
    const safeCounterparty = sanitizeForFs(inv.counterpartyName);
    const folder = `${safeNumber}_${safeCounterparty}`;
    const targetName = inv.fileName?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "file.pdf";

    try {
      const blobInfo = await head(inv.fileUrl!, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const downloadUrl =
        (blobInfo as { downloadUrl?: string }).downloadUrl ?? inv.fileUrl!;
      const res = await fetch(downloadUrl, {
        headers: process.env.BLOB_READ_WRITE_TOKEN
          ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
          : undefined,
      });
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      zip.file(`${folder}/${targetName}`, ab);
    } catch (e) {
      console.error("Errore download fattura estera", inv.id, e);
      continue;
    }

    csvRows.push(
      [
        csvField(inv.number),
        csvField(inv.type === "sale" ? "Emessa" : "Ricevuta"),
        csvField(inv.counterpartyName),
        csvField(inv.counterpartyVat ?? ""),
        csvField(inv.issueDate.toISOString().slice(0, 10)),
        csvField(inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : ""),
        csvField(formatCurrency(parseFloat(inv.totalAmount))),
        csvField(inv.currency),
        csvField(inv.status),
        csvField(targetName),
      ].join(";"),
    );
  }

  // BOM UTF-8 per Excel in italiano
  zip.file("riepilogo.csv", "﻿" + csvRows.join("\n"));

  const blob = await zip.generateAsync({ type: "blob" });

  const ts = new Date().toISOString().slice(0, 10);
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set(
    "Content-Disposition",
    `attachment; filename="fatture-estere-${ts}.zip"`,
  );
  headers.set("Content-Length", String(blob.size));

  return new NextResponse(blob, { status: 200, headers });
}

function sanitizeForFs(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function csvField(s: string): string {
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
