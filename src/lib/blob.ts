import "server-only";
import { put, del } from "@vercel/blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn("BLOB_READ_WRITE_TOKEN non impostato — upload fatture non funzionerà");
}

export type UploadedBlob = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

export async function uploadInvoiceFile(opts: {
  fileName: string;
  contentType: string;
  data: Buffer;
}): Promise<UploadedBlob> {
  const safeName = sanitizeFileName(opts.fileName);
  const key = `fatture/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const blob = await put(key, opts.data, {
    access: "private",
    contentType: opts.contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  } as Parameters<typeof put>[2]);

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: opts.contentType,
    size: opts.data.byteLength,
  };
}

export async function deleteInvoiceFile(url: string) {
  if (!url) return;
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    console.error("Errore eliminazione blob:", e);
  }
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}
