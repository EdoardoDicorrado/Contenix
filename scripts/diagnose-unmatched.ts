/**
 * Diagnosi: perché alcuni movimenti non hanno match con le regole?
 *
 * Esegue:
 *   - prende tutti i movimenti senza categoria e non transfer
 *   - raggruppa per "fingerprint" (primi token significativi della descrizione)
 *   - mostra i gruppi più grandi → questi sono i candidati per nuove regole
 *   - per i singleton, mostra i primi 30 esempi per capire la varietà
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, isNull } from "drizzle-orm";
import ws from "ws";
import { movements } from "../src/lib/db/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL non impostata. Imposta .env.local.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const NOISE = new Set([
  "bonifico", "pagamento", "incasso", "addebito", "accredito", "versamento",
  "sepa", "fatt", "fattura", "del", "al", "da", "in", "per", "via", "c/o",
  "spese", "commissioni", "sdd", "carta", "estratto", "conto", "saldo",
  "rid", "nr", "ord", "ben", "beneficiario", "ordinante", "rif",
  "cro", "iur", "trn", "cod", "codice", "data", "valuta", "dare",
  "avere", "uscita", "entrata", "movimento", "credito", "debito", "cliente",
  "fornitore", "italia", "italy", "spa", "srl", "sas", "snc",
  "dt", "acq", "pos", "merchant", "voi", "vostro", "favore", "disposto",
  "istantaneo", "europea", "europe", "limited",
  "effettuato", "ore", "mediante", "presso", "ctv", "usd", "eur", "cambio",
  "commissione", "conversione", "valutaria", "applicata", "operazione",
  "autorizzazione", "ora", "alle", "intern", "inter", "notprovided", "cash",
]);

function fingerprint(text: string, maxTokens: number = 2): string {
  if (!text) return "";
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s./@-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(/[\s./]+/)
    .filter((t) => {
      if (t.length < 3) return false;
      if (/^\d+$/.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (/^x+$/.test(t)) return false;
      if (NOISE.has(t)) return false;
      return true;
    });
  return tokens.slice(0, maxTokens).join(" ");
}

async function main() {
  // Movimenti senza categoria e non transfer
  const unmatched = await db
    .select({
      id: movements.id,
      description: movements.description,
      amount: movements.amount,
      type: movements.type,
      date: movements.date,
    })
    .from(movements)
    .where(and(isNull(movements.categoryId), eq(movements.isTransfer, false)));

  console.log(`\n${unmatched.length} movimenti senza match.\n`);

  // Raggruppa per fingerprint
  const groups = new Map<string, typeof unmatched>();
  const noFp: typeof unmatched = [];
  for (const m of unmatched) {
    const fp = fingerprint(m.description);
    if (!fp) {
      noFp.push(m);
      continue;
    }
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp)!.push(m);
  }

  // Ordina per dimensione gruppo
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

  console.log("=".repeat(80));
  console.log("TOP 25 PATTERN UNMATCHED (candidati per nuove regole)");
  console.log("=".repeat(80));
  for (const [fp, rows] of sorted.slice(0, 25)) {
    const totIn = rows.filter((r) => r.type === "income").reduce((s, r) => s + parseFloat(r.amount), 0);
    const totOut = rows.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(r.amount), 0);
    const tot = totIn + totOut;
    console.log(
      `${String(rows.length).padStart(3)}x  "${fp.padEnd(28)}"  EUR ${tot.toFixed(0).padStart(7)}`,
    );
    // mostra 2 esempi di descrizione (troncata)
    const sample = rows.slice(0, 2);
    for (const s of sample) {
      console.log(`     │ ${s.description.slice(0, 90)}`);
    }
  }

  // Conteggio gruppi vs singletons
  const groupsWith2Plus = sorted.filter(([, v]) => v.length >= 2);
  const singletons = sorted.filter(([, v]) => v.length === 1);
  console.log("\n" + "=".repeat(80));
  console.log("RIEPILOGO");
  console.log("=".repeat(80));
  console.log(`Pattern con ≥2 movimenti:  ${groupsWith2Plus.length} pattern → ${groupsWith2Plus.reduce((s, [, v]) => s + v.length, 0)} movimenti`);
  console.log(`Singletons (1 movimento):  ${singletons.length}`);
  console.log(`Senza fingerprint:         ${noFp.length}`);
  console.log(`\nTotal:                     ${unmatched.length}`);

  // Esempi di singletons
  console.log("\n" + "=".repeat(80));
  console.log("PRIMI 20 SINGLETONS (per capire la varietà)");
  console.log("=".repeat(80));
  for (const [fp, rows] of singletons.slice(0, 20)) {
    console.log(`  "${fp.padEnd(25)}" → ${rows[0].description.slice(0, 80)}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
