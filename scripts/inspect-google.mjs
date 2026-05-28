// Analisi vendor REALI estratti da descrizione estesa (col G).
// La col G ha pattern come:
//   "EFFETTUATO IL ... MEDIANTE LA CARTA ... PRESSO ... ESERCENTE NOME EUR..."  → POS
//   "COD. DISP.: ... NOME: VENDOR_NAME MANDATO: ..."                            → ADUE
//   "0125050299966618 02INTERyyyymmddHSRT... 03069..."                          → bonifico SEPA
//
// Estraiamo il "merchant/vendor reale" da queste stringhe.
import readXlsxFile from "read-excel-file/node";
import { resolve, join } from "node:path";

const path = join(resolve("ESEMPI MOVIMENTO"), "movimenti google.xlsx");
const sheets = await readXlsxFile(path);

function extractVendor(descExt) {
  if (!descExt) return null;
  // Pattern 1: "NOME: VENDOR_NAME MANDATO: ..."
  const adueMatch = descExt.match(/NOME:\s+(.+?)\s+MANDATO/i);
  if (adueMatch) return adueMatch[1].trim();
  // Pattern 2: "MEDIANTE LA CARTA ... PRESSO/ESERCENTE: VENDOR" — vediamo varianti
  // Spesso il merchant appare dopo "MEDIANTE LA CARTA 4838 XXXX XXXX 2841 PRESSO ..."
  const posMatch = descExt.match(/MEDIANTE LA CARTA[^A-Z]+(?:XXXX\s+)?\d+\s+PRESSO[:\s]+([^/]+?)(?:\s+(?:CITTA|EUR|VALUTA|DATA|ID OPERAZIONE|ORA AUTORIZZAZIONE)|$)/i);
  if (posMatch) return posMatch[1].trim();
  // Pattern 3: "DI VOSTRA AZIENDA A VOI INTESTATA PER ACQUISTI EFFETTUATI PRESSO VENDOR_NAME"
  const presso = descExt.match(/PRESSO\s+([A-Z][A-Za-z0-9 .&'\-*]+?)(?:\s+(?:DEL|EUR|CITTA|DATA|ID OPERAZIONE|ORA AUTORIZZAZIONE|VALUTA)|$)/);
  if (presso) return presso[1].trim();
  return null;
}

const byCat = new Map();

for (const s of sheets) {
  for (let i = 2; i < s.data.length; i++) {
    const row = s.data[i];
    const cat = row[0];
    const desc = row[3];
    const accr = row[4];
    const addeb = row[5];
    const descExt = row[6];

    if (typeof cat !== "string" || !cat.trim()) continue;
    if (desc == null || String(desc).trim() === "") continue;

    let amount = 0;
    let type = "expense";
    if (typeof accr === "number" && accr > 0) {
      amount = accr;
      type = "income";
    } else if (typeof addeb === "number" && addeb !== 0) {
      amount = Math.abs(addeb);
      type = "expense";
    } else continue;

    const k = cat.trim();
    if (!byCat.has(k)) {
      byCat.set(k, { count: 0, income: 0, expense: 0, vendors: new Map(), rawSample: [] });
    }
    const e = byCat.get(k);
    e.count += 1;
    if (type === "income") e.income += amount;
    else e.expense += amount;

    const vendor = extractVendor(typeof descExt === "string" ? descExt : "") || "(unknown)";
    e.vendors.set(vendor, (e.vendors.get(vendor) ?? 0) + 1);

    if (e.rawSample.length < 2 && vendor === "(unknown)" && typeof descExt === "string") {
      e.rawSample.push(descExt.slice(0, 200));
    }
  }
}

const sorted = Array.from(byCat.entries()).sort((a, b) => b[1].count - a[1].count);
for (const [cat, e] of sorted) {
  const dir = e.income > e.expense ? "ENTRATA" : "USCITA";
  const total = e.income + e.expense;
  console.log("\n" + "=".repeat(80));
  console.log(`${cat}  (${e.count} righe, ${dir}, EUR ${total.toFixed(0)})`);
  console.log("=".repeat(80));
  const topV = Array.from(e.vendors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [v, n] of topV) {
    console.log(`  ${String(n).padStart(3)} x ${v.slice(0, 70)}`);
  }
  if (e.rawSample.length > 0) {
    console.log("  Esempio unknown:");
    e.rawSample.forEach((r) => console.log(`    ${r}`));
  }
}

let totIn = 0, totOut = 0, totRows = 0;
for (const e of byCat.values()) {
  totIn += e.income;
  totOut += e.expense;
  totRows += e.count;
}
console.log("\n" + "=".repeat(80));
console.log(`Righe: ${totRows} | Entrate EUR ${totIn.toFixed(0)} | Uscite EUR ${totOut.toFixed(0)}`);
