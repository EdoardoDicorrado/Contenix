"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  type InvoiceInput,
} from "@/lib/db/queries/invoices";
import { uploadInvoiceFile } from "@/lib/blob";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function extractUpload(
  formData: FormData,
): Promise<
  | { ok: true; file: null }
  | { ok: true; file: { url: string; name: string; mime: string; size: number } }
  | { ok: false; error: string }
> {
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: true, file: null };
  if (f.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File troppo grande (max 20 MB)" };
  }
  const mime = f.type || "application/octet-stream";
  if (ALLOWED_MIME.size > 0 && !ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "Formato non supportato (PDF, XML, JPG, PNG, WEBP)" };
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  const blob = await uploadInvoiceFile({
    fileName: f.name,
    contentType: mime,
    data: buffer,
  });
  return {
    ok: true,
    file: { url: blob.url, name: f.name, mime, size: blob.size },
  };
}

const InvoiceSchema = z.object({
  number: z.string().min(1, "Numero obbligatorio").max(50),
  type: z.enum(["purchase", "sale"]),
  counterpartyName: z.string().min(1, "Controparte obbligatoria").max(255),
  counterpartyVat: z.string().max(20).optional(),
  issueDate: z.string().min(1, "Data emissione obbligatoria"),
  dueDate: z.string().optional(),
  totalAmount: z
    .string()
    .min(1, "Importo totale obbligatorio")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Importo deve essere positivo",
    }),
  vatAmount: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), {
      message: "IVA deve essere un numero positivo",
    }),
  currency: z.string().length(3).default("EUR"),
  status: z.enum(["pending", "partial", "paid", "overdue", "cancelled"]),
  description: z.string().max(2000).optional(),
  paymentIban: z.string().max(34).optional(),
  isCreditNote: z.string().optional(), // "on" o "true" dal checkbox
  relatedInvoiceId: z.string().uuid().optional(),
});

export type InvoiceFormState =
  | { ok: false; errors: Record<string, string> }
  | { ok: true }
  | null;

function flatten(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const p = i.path.join(".");
    if (!out[p]) out[p] = i.message;
  }
  return out;
}

function parse(formData: FormData) {
  const raw = {
    number: String(formData.get("number") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
    counterpartyName: String(formData.get("counterpartyName") ?? "").trim(),
    counterpartyVat: String(formData.get("counterpartyVat") ?? "").trim().toUpperCase() || undefined,
    issueDate: String(formData.get("issueDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    totalAmount: String(formData.get("totalAmount") ?? "").replace(",", "."),
    vatAmount: String(formData.get("vatAmount") ?? "").replace(",", ".") || undefined,
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    status: String(formData.get("status") ?? "pending"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    paymentIban: String(formData.get("paymentIban") ?? "").trim().replace(/\s+/g, "").toUpperCase() || undefined,
    isCreditNote: (formData.get("isCreditNote") as string) || undefined,
    relatedInvoiceId: (formData.get("relatedInvoiceId") as string) || undefined,
  };
  return InvoiceSchema.safeParse(raw);
}

function toInput(data: z.infer<typeof InvoiceSchema>): InvoiceInput {
  return {
    number: data.number,
    type: data.type,
    counterpartyName: data.counterpartyName,
    counterpartyVat: data.counterpartyVat ?? null,
    issueDate: new Date(data.issueDate),
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    totalAmount: parseFloat(data.totalAmount).toFixed(2),
    vatAmount: data.vatAmount ? parseFloat(data.vatAmount).toFixed(2) : null,
    currency: data.currency,
    status: data.status,
    description: data.description ?? null,
    paymentIban: data.paymentIban ?? null,
    isCreditNote: data.isCreditNote === "on" || data.isCreditNote === "true",
    relatedInvoiceId: data.relatedInvoiceId ?? null,
  };
}

export async function createInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };

  const upload = await extractUpload(formData);
  if (!upload.ok) return { ok: false, errors: { file: upload.error } };

  const input = toInput(parsed.data);
  if (upload.file) {
    input.fileUrl = upload.file.url;
    input.fileName = upload.file.name;
    input.fileMime = upload.file.mime;
    input.fileSize = upload.file.size;
  }

  await createInvoice(input);
  revalidatePath("/fatture");
  revalidatePath("/");
  redirect("/fatture");
}

export async function updateInvoiceAction(
  id: string,
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error) };

  const upload = await extractUpload(formData);
  if (!upload.ok) return { ok: false, errors: { file: upload.error } };

  const input = toInput(parsed.data);
  if (upload.file) {
    input.fileUrl = upload.file.url;
    input.fileName = upload.file.name;
    input.fileMime = upload.file.mime;
    input.fileSize = upload.file.size;
  }

  await updateInvoice(id, input);
  revalidatePath("/fatture");
  revalidatePath(`/fatture/${id}`);
  revalidatePath("/");
  redirect(`/fatture/${id}`);
}

export async function deleteInvoiceAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteInvoice(id);
  revalidatePath("/fatture");
  revalidatePath("/");
}
