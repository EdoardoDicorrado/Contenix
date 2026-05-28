// Migrazione one-shot per F1: crea conto principale + assegna tutti i movimenti
// esistenti a esso. Idempotente: si può ri-eseguire senza problemi.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);

// 1) Cerca conto primario esistente
const existing = await sql`SELECT id, name FROM financial_accounts WHERE is_primary = true LIMIT 1`;

let primaryId;
if (existing.length > 0) {
  primaryId = existing[0].id;
  console.log(`Conto principale già esistente: "${existing[0].name}" (${primaryId})`);
} else {
  const inserted = await sql`
    INSERT INTO financial_accounts (name, type, currency, color, opening_balance, is_primary, is_active)
    VALUES ('Conto principale', 'bank', 'EUR', '#2563eb', '0', true, true)
    RETURNING id, name
  `;
  primaryId = inserted[0].id;
  console.log(`Conto principale creato: "${inserted[0].name}" (${primaryId})`);
}

// 2) Migra movimenti senza account_id
const updated = await sql`
  UPDATE movements
  SET account_id = ${primaryId}, updated_at = NOW()
  WHERE account_id IS NULL
  RETURNING id
`;
console.log(`Movimenti migrati al conto principale: ${updated.length}`);

// 3) Report finale
const totals = await sql`
  SELECT
    (SELECT COUNT(*) FROM financial_accounts) AS accounts_total,
    (SELECT COUNT(*) FROM movements WHERE account_id IS NOT NULL) AS movements_with_account,
    (SELECT COUNT(*) FROM movements WHERE account_id IS NULL) AS movements_orphan
`;
console.log(`Conti totali: ${totals[0].accounts_total}`);
console.log(`Movimenti con account_id: ${totals[0].movements_with_account}`);
console.log(`Movimenti orfani (NULL): ${totals[0].movements_orphan}`);
