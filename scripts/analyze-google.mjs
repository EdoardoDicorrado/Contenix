// Analisi completa del file movimenti google.xlsx:
// - Categorie uniche per foglio + totale
// - Pattern descrizione → categoria (con frequenza)
// - Quali pattern sono "affidabili" (sempre stessa categoria)
import readXlsxFile from "read-excel-file/node";
import { resolve, join } from "node:path";

const path = join(resolve("ESEMPI MOVIMENTO"), "movimenti google.xlsx");
const sheets = await readXlsxFile(path);

// Categorie globali (canoniche)
const allCategoryCounts = new Map(); // categoria → conteggio
const allRows = []; // tutte le righe valide
let totalRows = 0;

for (const s of sheets) {
  // Salta righe 0-1 (header), inizia dalla 2
  for (let i = 2; i < s.data.length; i++) {
    const row = s.data[i];
    const categoria = row[0];
    const descrizione = row[3];
    const accrediti = row[4];
    const addebiti = row[5];
    const descrizioneEstesa = row[6];

    if (!categoria || !descrizione) continue;
    if (typeof categoria !== "string") continue;

    // Determina tipo
    let amount = 0;
    let type = "expense";
    if (typeof accrediti === "number" && accrediti > 0) {
      amount = accrediti;
      type = "income";
    } else if (typeof addebiti === "number") {
      amount = Math.abs(addebiti);
      type = "expense";
    } else continue;

    const cat = categoria.trim();
    allCategoryCounts.set(cat, (allCategoryCounts.get(cat) ?? 0) + 1);
    allRows.push({
      foglio: s.sheet,
      categoria: cat,
      descrizione: String(descrizione).trim(),
      descrizioneEstesa: String(descrizioneEstesa ?? "").trim(),
      amount,
      type,
    });
    totalRows++;
  }
}

console.log("=".repeat(80));
console.log(`TOTALE RIGHE: ${totalRows} (su ${sheets.length} fogli)`);
console.log("=".repeat(80));

console.log("\nCATEGORIE UNICHE (ordinate per frequenza):");
const sortedCats = Array.from(allCategoryCounts.entries()).sort((a, b) => b[1] - a[1]);
for (const [cat, n] of sortedCats) {
  const isIncome = allRows.find((r) => r.categoria === cat)?.type === "income";
  console.log(`  ${String(n).padStart(3)} × ${cat} ${isIncome ? "(↑ entrata)" : "(↓ uscita)"}`);
}

// Pattern affidabili: fingerprint descrizione → set di categorie
function fingerprint(text) {
  return text.toLowerCase()
    .replace(/[^a-zà-úü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !/^\d+$/.test(t))
    .slice(0, 2)
    .join(" ");
}

const patternCats = new Map(); // pattern → Map(categoria → count)
for (const r of allRows) {
  const fp = fingerprint(r.descrizione);
  if (!fp) continue;
  if (!patternCats.has(fp)) patternCats.set(fp, new Map());
  const inner = patternCats.get(fp);
  inner.set(r.categoria, (inner.get(r.categoria) ?? 0) + 1);
}

console.log("\nPATTERN DESCRIZIONE → CATEGORIA (solo se ≥3 righe, con affidabilità %):");
const patternStats = [];
for (const [pattern, cats] of patternCats) {
  const total = Array.from(cats.values()).reduce((a, b) => a + b, 0);
  if (total < 3) continue;
  // Trova la categoria dominante
  let topCat = null;
  let topCount = 0;
  for (const [c, n] of cats) {
    if (n > topCount) { topCount = n; topCat = c; }
  }
  const reliability = (topCount / total) * 100;
  patternStats.push({ pattern, total, topCat, topCount, reliability, alternatives: cats.size });
}
patternStats.sort((a, b) => b.total - a.total);

for (const p of patternStats.slice(0, 30)) {
  const flag = p.reliability >= 95 ? "✓✓" : p.reliability >= 75 ? "✓ " : "⚠ ";
  console.log(`  ${flag} ${String(p.total).padStart(3)}× "${p.pattern.padEnd(25)}" → ${p.topCat.padEnd(20)} (${p.reliability.toFixed(0)}% affidabile${p.alternatives > 1 ? `, ${p.alternatives - 1} altre cat` : ""})`);
}

// Calcola statistiche aggregate
console.log("\nRIASSUNTO PATTERN:");
const reliable = patternStats.filter(p => p.reliability >= 95);
const probabili = patternStats.filter(p => p.reliability >= 75 && p.reliability < 95);
const ambigui = patternStats.filter(p => p.reliability < 75);
console.log(`  ${reliable.length} pattern ALTAMENTE AFFIDABILI (≥95%) — coprono ${reliable.reduce((s,p)=>s+p.total,0)} righe`);
console.log(`  ${probabili.length} pattern PROBABILI (75-95%) — coprono ${probabili.reduce((s,p)=>s+p.total,0)} righe`);
console.log(`  ${ambigui.length} pattern AMBIGUI (<75%) — coprono ${ambigui.reduce((s,p)=>s+p.total,0)} righe`);
