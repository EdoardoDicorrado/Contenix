import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { head } from "@vercel/blob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [inv] = await db
    .select({ fileUrl: invoices.fileUrl, fileName: invoices.fileName, fileMime: invoices.fileMime })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!inv || !inv.fileUrl) {
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }

  // Fetch del file dal Blob privato usando il token server-side
  const blobInfo = await head(inv.fileUrl, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const downloadUrl = (blobInfo as { downloadUrl?: string }).downloadUrl ?? inv.fileUrl;

  const fileRes = await fetch(downloadUrl, {
    headers: process.env.BLOB_READ_WRITE_TOKEN
      ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
      : undefined,
  });

  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json(
      { error: "Errore lettura file dallo storage" },
      { status: 502 },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", inv.fileMime ?? "application/octet-stream");
  if (inv.fileName) {
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(inv.fileName)}"`,
    );
  }
  const len = fileRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  return new NextResponse(fileRes.body, { status: 200, headers });
}
