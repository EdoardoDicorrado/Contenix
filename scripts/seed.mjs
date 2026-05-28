import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const seedCategories = [
  { name: "Vendite prodotti", type: "income", color: "#16a34a" },
  { name: "Servizi", type: "income", color: "#0ea5e9" },
  { name: "Altre entrate", type: "income", color: "#a3a3a3" },
  { name: "Materie prime", type: "expense", color: "#dc2626" },
  { name: "Stipendi", type: "expense", color: "#f97316" },
  { name: "Affitto", type: "expense", color: "#8b5cf6" },
  { name: "Utenze", type: "expense", color: "#06b6d4" },
  { name: "Fornitori", type: "expense", color: "#ef4444" },
  { name: "Servizi professionali", type: "expense", color: "#eab308" },
  { name: "Altre uscite", type: "expense", color: "#a3a3a3" },
];

console.log("Inserisco categorie...");
let inserted = 0;
let skipped = 0;
for (const c of seedCategories) {
  const existing = await sql`SELECT id FROM categories WHERE name = ${c.name} LIMIT 1`;
  if (existing.length > 0) {
    skipped++;
    continue;
  }
  await sql`INSERT INTO categories (name, type, color) VALUES (${c.name}, ${c.type}, ${c.color})`;
  inserted++;
}
console.log(`OK — ${inserted} inserite, ${skipped} già presenti.`);
