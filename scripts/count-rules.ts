import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { categorizationRules, categories } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
const all = await db
  .select({
    pattern: categorizationRules.pattern,
    catName: categories.name,
    matchCount: categorizationRules.matchCount,
  })
  .from(categorizationRules)
  .leftJoin(categories, eq(categorizationRules.categoryId, categories.id));

console.log(`Regole in DB: ${all.length}`);
console.log("\nRegole con pattern persona/Hera/storno:");
for (const r of all) {
  if (
    /balduzzi|ibatici|sfirschi|corrado|rossetti|labati|ottini|gaetano|bucchioni|cdg service|hera|storno|white paper|costo pag|commissione disp|maggiorazione|agenzia entrate|comune di piacenza|martino/i.test(
      r.pattern,
    )
  ) {
    console.log(`  "${r.pattern.padEnd(35)}" → ${r.catName} (match: ${r.matchCount})`);
  }
}

await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
