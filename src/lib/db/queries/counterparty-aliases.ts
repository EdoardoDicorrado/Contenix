import "server-only";
import { db } from "@/lib/db";
import { counterpartyAliases } from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export type AliasEntry = {
  pattern: string;
  boost: number;
};

/**
 * Normalizza il nome controparte per essere usabile come chiave di alias.
 * Rimuove suffissi societari (srl, spa, sas, bv, gmbh, ...) e abbassa case.
 *
 * "Acme SRL" → "acme"
 * "ACME HOLDINGS B.V." → "acme holdings"
 */
export function counterpartyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/\\]/g, " ")
    .replace(
      /\b(srl|spa|sas|snc|s\.r\.l|s\.p\.a|s\.a\.s|s\.n\.c|bv|gmbh|ltd|llc|ag|sa|sl|sarl|kft|kg|inc|corp)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Restituisce gli alias attivi per UNA controparte. Restituisce sempre
 * `pattern` lowercase e `boost`.
 */
export async function getAliasesFor(name: string): Promise<AliasEntry[]> {
  const key = counterpartyKey(name);
  if (!key) return [];
  try {
    return await db
      .select({ pattern: counterpartyAliases.aliasPattern, boost: counterpartyAliases.boost })
      .from(counterpartyAliases)
      .where(eq(counterpartyAliases.counterpartyKey, key))
      .orderBy(desc(counterpartyAliases.boost));
  } catch {
    // Fallback se la tabella non è ancora stata creata (drizzle-kit push pending)
    return [];
  }
}

/**
 * Lookup batch: dato un set di nomi, restituisce mappa name → alias[].
 * Usato dalle suggestMatches per evitare N+1.
 */
export async function getAliasesMap(
  names: string[],
): Promise<Map<string, AliasEntry[]>> {
  const keys = Array.from(new Set(names.map(counterpartyKey).filter(Boolean)));
  if (keys.length === 0) return new Map();
  let rows: Array<{ key: string; pattern: string; boost: number }> = [];
  try {
    rows = await db
      .select({
        key: counterpartyAliases.counterpartyKey,
        pattern: counterpartyAliases.aliasPattern,
        boost: counterpartyAliases.boost,
      })
      .from(counterpartyAliases)
      .where(inArray(counterpartyAliases.counterpartyKey, keys));
  } catch {
    // Tabella non ancora creata: nessun alias disponibile
    rows = [];
  }

  const map = new Map<string, AliasEntry[]>();
  for (const r of rows) {
    const list = map.get(r.key) ?? [];
    list.push({ pattern: r.pattern, boost: r.boost });
    map.set(r.key, list);
  }
  // Rimappa per nome originale (non chiave)
  const byName = new Map<string, AliasEntry[]>();
  for (const n of names) byName.set(n, map.get(counterpartyKey(n)) ?? []);
  return byName;
}

/** Stop-word italiane comuni nelle descrizioni bancarie + termini tecnici. */
const STOP_WORDS = new Set([
  "bonifico",
  "bonif",
  "addebito",
  "accredito",
  "pagamento",
  "pag",
  "ricevuto",
  "ricev",
  "disposto",
  "ordinante",
  "beneficiario",
  "causale",
  "fattura",
  "fatt",
  "rif",
  "ref",
  "riferimento",
  "saldo",
  "anticipo",
  "acconto",
  "iban",
  "swift",
  "bic",
  "sepa",
  "istantaneo",
  "istant",
  "estero",
  "voi",
  "noi",
  "altri",
  "dal",
  "del",
  "della",
  "dello",
  "della",
  "delle",
  "degli",
  "alla",
  "per",
  "via",
  "card",
  "pos",
  "carta",
  "credito",
]);

/**
 * Estrae i token significativi dalla descrizione di un movimento.
 *  - lowercase
 *  - rimuove punteggiatura
 *  - rimuove stop-word e numeri (puri o quasi)
 *  - rimuove token già presenti nel `counterpartyName` canonico
 *  - ritorna i primi `limit` token rimanenti
 */
export function extractSignificantTokens(
  description: string,
  counterpartyName: string,
  limit = 4,
): string[] {
  const exclude = new Set(
    counterpartyKey(counterpartyName)
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
  return description
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !STOP_WORDS.has(t))
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !exclude.has(t))
    .slice(0, limit);
}

/**
 * Salva (o ri-usa) un alias appreso da un match manuale.
 *
 * Se i token estratti dalla description sono tutti già presenti nel
 * counterpartyName canonico, non c'è bisogno di un alias → no-op.
 */
export async function learnAliasFromMatch(opts: {
  counterpartyName: string;
  movementDescription: string;
  source?: "auto" | "manual";
  boost?: number;
}): Promise<{ created: boolean; pattern: string | null }> {
  const key = counterpartyKey(opts.counterpartyName);
  if (!key) return { created: false, pattern: null };

  const tokens = extractSignificantTokens(
    opts.movementDescription,
    opts.counterpartyName,
    3,
  );
  if (tokens.length === 0) return { created: false, pattern: null };

  // I primi 2 token sono il pattern. Se solo 1, basta quello.
  const pattern = tokens.slice(0, 2).join(" ");

  try {
    await db
      .insert(counterpartyAliases)
      .values({
        counterpartyKey: key,
        aliasPattern: pattern,
        boost: opts.boost ?? 30,
        source: opts.source ?? "auto",
      })
      .onConflictDoUpdate({
        target: [
          counterpartyAliases.counterpartyKey,
          counterpartyAliases.aliasPattern,
        ],
        set: {
          usageCount: sql`${counterpartyAliases.usageCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  } catch {
    // Tabella non ancora creata: no-op (l'utente farà drizzle-kit push)
    return { created: false, pattern };
  }

  return { created: true, pattern };
}

/**
 * Incrementa il contatore d'uso quando un alias scatta in scoring.
 * Best-effort: errori vengono inghiottiti per non bloccare la ricerca.
 */
export async function bumpAliasUsage(key: string, pattern: string) {
  try {
    await db
      .update(counterpartyAliases)
      .set({
        usageCount: sql`${counterpartyAliases.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(
        and(
          eq(counterpartyAliases.counterpartyKey, key),
          eq(counterpartyAliases.aliasPattern, pattern),
        ),
      );
  } catch {
    // ignora
  }
}
