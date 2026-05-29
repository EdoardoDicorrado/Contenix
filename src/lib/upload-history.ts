/**
 * Storico degli upload fatture in localStorage. Stessa filosofia di
 * sync-history: niente DB, solo client-side. Sufficiente per vedere
 * "cosa è entrato e cosa no" senza scrivere su tabelle.
 */

import type { UploadResult } from "@/app/(app)/fatture/carica/actions";

export type UploadRunEntry = {
  ranAt: string;
  result: UploadResult;
};

const KEY = "upload-history-invoices";
const MAX_ENTRIES = 10; // ultime 10 sessioni
const MAX_FILES_PER_RUN = 500; // troncamento per non saturare localStorage

export function getUploadHistory(): UploadRunEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as UploadRunEntry[];
  } catch {
    return [];
  }
}

export function appendUploadRun(result: UploadResult): UploadRunEntry {
  // Tronchiamo la lista file per evitare di saturare localStorage su upload molto grandi
  const compact: UploadResult = {
    ...result,
    files: result.files.slice(0, MAX_FILES_PER_RUN),
  };
  const entry: UploadRunEntry = {
    ranAt: new Date().toISOString(),
    result: compact,
  };
  if (typeof window === "undefined") return entry;
  try {
    const list = getUploadHistory();
    const next = [entry, ...list].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota / disabled — non bloccare
  }
  return entry;
}

export function clearUploadHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
