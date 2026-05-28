import "server-only";
import { createHash } from "node:crypto";

export function sha256(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function detectMime(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime !== "application/octet-stream") return providedMime;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export function fileKind(fileName: string, mime: string): "xml" | "pdf" | "zip" | "other" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml") || mime.includes("xml")) return "xml";
  if (lower.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (lower.endsWith(".zip") || mime.includes("zip")) return "zip";
  return "other";
}
