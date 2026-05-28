import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`;
console.log("Tabelle nel DB:");
for (const r of rows) console.log("  -", r.table_name);
console.log(`Totale: ${rows.length} tabelle`);
