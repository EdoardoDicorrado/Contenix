/**
 * Storico delle sincronizzazioni persistito in localStorage.
 *
 * Niente DB per ora: ogni run viene appeso a un array client-side, con
 * dimensione massima per evitare di gonfiare la storage. È sufficiente per
 * "ultime sincronizzazioni" mostrate in /sincronizza.
 */

export type SyncRunType = "categories" | "employees" | "invoices";

export type SyncRunEntry<TPayload = unknown> = {
  /** ISO timestamp del momento del run. */
  ranAt: string;
  /** Payload risultato della sync (specifico per tipo). */
  result: TPayload;
};

const MAX_ENTRIES = 20;

function keyFor(type: SyncRunType) {
  return `sync-history-${type}`;
}

export function getSyncHistory<T = unknown>(
  type: SyncRunType,
): SyncRunEntry<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(type));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SyncRunEntry<T>[];
  } catch {
    return [];
  }
}

export function appendSyncRun<T>(type: SyncRunType, result: T): SyncRunEntry<T> {
  const entry: SyncRunEntry<T> = {
    ranAt: new Date().toISOString(),
    result,
  };
  if (typeof window === "undefined") return entry;
  try {
    const list = getSyncHistory<T>(type);
    const next = [entry, ...list].slice(0, MAX_ENTRIES);
    localStorage.setItem(keyFor(type), JSON.stringify(next));
  } catch {
    // quota / disabled — non bloccare
  }
  return entry;
}

export function clearSyncHistory(type: SyncRunType) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(keyFor(type));
  } catch {
    // ignore
  }
}
