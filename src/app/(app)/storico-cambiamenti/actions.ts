"use server";

import { revalidatePath } from "next/cache";
import { archiveOldChangeLog } from "@/lib/db/queries/category-change-log";

export type ArchiveResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function archiveChangeLogAction(): Promise<ArchiveResult> {
  try {
    const deleted = await archiveOldChangeLog(30);
    revalidatePath("/storico-cambiamenti");
    return { ok: true, deleted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore" };
  }
}
