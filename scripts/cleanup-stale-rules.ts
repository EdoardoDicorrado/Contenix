// Cleanup: cancella le regole che hanno pattern in VENDOR_RULES ma puntano
// a una categoryCanonical diversa da quella corrente (regole "stantie" da
// seed precedenti dove il mapping pattern→categoria era diverso).
//
// Per ogni pattern in VENDOR_RULES:
//   - Trova tutte le regole nel DB con quel pattern (lowercase)
//   - Tieni solo quella che punta alla categoryCanonical corrente
//   - Elimina le altre (i loro movimenti verranno ricategorizzati con apply)

import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, sql, ne } from "drizzle-orm";
import ws from "ws";
import { categories, categorizationRules } from "../src/lib/db/schema";
import { VENDOR_RULES } from "../src/lib/storico-knowledge";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  // Mappa nome canonico → id
  const allCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const byName = new Map(allCats.map((c) => [c.name.toLowerCase(), c.id]));

  let deleted = 0;
  for (const rule of VENDOR_RULES) {
    const currentCatId = byName.get(rule.categoryCanonical.toLowerCase());
    if (!currentCatId) {
      console.warn(`Categoria "${rule.categoryCanonical}" non esiste — skip cleanup per "${rule.pattern}"`);
      continue;
    }
    const normalized = rule.pattern.trim().toLowerCase();
    // Cancella le regole con stesso pattern MA categoryId != quello corrente
    const result = await db
      .delete(categorizationRules)
      .where(
        and(
          sql`LOWER(${categorizationRules.pattern}) = ${normalized}`,
          ne(categorizationRules.categoryId, currentCatId),
        ),
      )
      .returning({ id: categorizationRules.id, pattern: categorizationRules.pattern });

    if (result.length > 0) {
      console.log(`Eliminate ${result.length} regola/e stale per "${normalized}" (ora punta a ${rule.categoryCanonical})`);
      deleted += result.length;
    }
  }

  console.log(`\nTotale regole stale eliminate: ${deleted}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
