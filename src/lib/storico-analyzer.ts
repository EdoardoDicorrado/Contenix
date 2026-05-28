import {
  FORCED_INCOME_CANONICAL,
  getRecommendedRename,
  shouldSkipByDefault,
  VENDOR_RULES,
  type VendorRule,
} from "./storico-knowledge";

/**
 * Onboarding via Excel storico già categorizzato.
 *
 * Parsing di file Excel multi-foglio dove ogni foglio è un mese e ogni riga
 * ha:
 *   col[0] = Tipologia (categoria pre-assegnata dall'utente)
 *   col[1] = Data contabile (Date o stringa dd/mm/yyyy)
 *   col[3] = Descrizione (riga banca, può essere generica come "pagamento pos")
 *   col[4] = Accrediti (numero o vuoto)
 *   col[5] = Addebiti  (numero negativo o vuoto)
 *   col[6] = Descrizione estesa (vendor reale, es. "GRENKE LOCAZIONE")
 *
 * Le prime 2 righe sono header/sub-header, i dati partono dalla riga 2.
 *
 * Funzionalità:
 *  - merge automatico delle categorie con refusi e differenze di case
 *  - estrazione pattern affidabili (≥75% coerenti) per pre-popolare le
 *    regole di auto-categorizzazione
 *  - usa preferenzialmente la descrizione estesa (vendor) come pattern,
 *    perché è più stabile della descrizione "banca"
 */

export type StoricoRawRow = {
  sheetName: string;
  sheetIndex: number;
  rowIndex: number; // riga 0-based dentro al foglio
  date: Date;
  amount: number; // sempre positivo
  type: "income" | "expense";
  description: string;
  descriptionExt: string;
  rawCategory: string; // così come scritta nell'Excel (es. "Softwere AI")
};

export type StoricoParseResult = {
  rows: StoricoRawRow[];
  errors: Array<{ sheet: string; rowIndex: number; reason: string }>;
};

export type CategoryProposal = {
  /** Nome canonico proposto (es. "Software & SaaS") */
  canonical: string;
  /** Tutti i nomi grezzi che verranno fusi in questo canonico */
  sourceNames: string[];
  /** Quante righe complessive */
  totalRows: number;
  /** Tipo dedotto dal segno dei movimenti (income se la maggior parte è accredito) */
  type: "income" | "expense";
  /** Colore proposto (sempre #6b7280 grigio neutro, l'utente può cambiare) */
  color: string;
  /** Se ne esiste già una nel DB con lo stesso nome (case-insensitive), il suo id */
  matchesExistingId: string | null;
  /** Se true, la proposta arriva da un rename consigliato dalla knowledge base. */
  recommendedByKnowledge: boolean;
  /** Se true, va escluso di default (es. righe "Uscite" aggregate). */
  skipByDefault: boolean;
};

export type RuleProposal = {
  /** Pattern (lowercase) — verrà salvato come categorization_rules.pattern */
  pattern: string;
  /** "curated" = dalla knowledge base, "statistical" = estratta dal file */
  origin: "curated" | "statistical";
  /** Da dove arriva il pattern: descrizione estesa o normale */
  source: "descriptionExt" | "description";
  /** Quante righe matchano */
  coverageCount: number;
  /** % di affidabilità (top_count / total per le statistical, 1.0 per le curated) */
  reliability: number;
  /** Nome canonico della categoria proposta */
  canonicalCategoryName: string;
  /** Tipo movimento dominante */
  movementType: "income" | "expense";
  /** Etichetta human-readable (solo per le curated, es. "Anthropic Claude") */
  label?: string;
};

// ===================================================================
// PARSING
// ===================================================================

/**
 * Parsa il risultato di readXlsxFile (multi-sheet). Tollera fogli vuoti,
 * righe con dati mancanti, date in formato Date o "dd/mm/yyyy".
 */
export function parseStoricoSheets(
  sheets: Array<{ sheet: string; data: unknown[][] }>,
): StoricoParseResult {
  const rows: StoricoRawRow[] = [];
  const errors: StoricoParseResult["errors"] = [];

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const s = sheets[sIdx];
    // Le prime 2 righe sono header/sub-header
    for (let i = 2; i < s.data.length; i++) {
      const row = s.data[i] ?? [];
      const rawCategory = row[0];
      const rawDate = row[1];
      const rawDesc = row[3];
      const rawAccr = row[4];
      const rawAddeb = row[5];
      const rawDescExt = row[6];

      // Salta righe senza categoria o senza descrizione (probabili separatori)
      if (typeof rawCategory !== "string" || !rawCategory.trim()) continue;
      if (rawDesc == null || String(rawDesc).trim() === "") continue;

      // Data
      let date: Date | null = null;
      if (rawDate instanceof Date) {
        date = rawDate;
      } else if (typeof rawDate === "string") {
        const m = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m) {
          const dd = parseInt(m[1], 10);
          const mm = parseInt(m[2], 10);
          let yyyy = parseInt(m[3], 10);
          if (yyyy < 100) yyyy += 2000;
          date = new Date(Date.UTC(yyyy, mm - 1, dd));
        }
      }
      if (!date || isNaN(date.getTime())) {
        errors.push({ sheet: s.sheet, rowIndex: i, reason: "data non valida" });
        continue;
      }

      // Importo + tipo
      let amount = 0;
      let type: "income" | "expense" = "expense";
      if (typeof rawAccr === "number" && rawAccr > 0) {
        amount = rawAccr;
        type = "income";
      } else if (typeof rawAddeb === "number" && rawAddeb !== 0) {
        amount = Math.abs(rawAddeb);
        type = "expense";
      } else {
        errors.push({ sheet: s.sheet, rowIndex: i, reason: "importo mancante" });
        continue;
      }

      rows.push({
        sheetName: s.sheet,
        sheetIndex: sIdx,
        rowIndex: i,
        date,
        amount,
        type,
        description: String(rawDesc).trim(),
        descriptionExt: typeof rawDescExt === "string" ? rawDescExt.trim() : "",
        rawCategory: rawCategory.trim(),
      });
    }
  }

  return { rows, errors };
}

// ===================================================================
// MERGE CATEGORIE (auto)
// ===================================================================

/**
 * Distanza di Levenshtein limitata (early-exit se supera maxDistance).
 */
function levenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // replace
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Normalizza un nome categoria per il confronto: lowercase, no accenti,
 * no spazi multipli, no caratteri non alfanumerici (eccetto spazi).
 */
function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decide se due nomi categoria sono "lo stesso concetto" e dovrebbero essere
 * fusi insieme. Regole:
 *  - identici case-insensitive → sì
 *  - distanza ≤ 2 su nomi entrambi >= 5 caratteri → sì (refusi tipo Softwere/Software)
 *  - uno è prefisso dell'altro con distanza ≤ 3 → sì
 *      ("Software AI" e "Software" → sì, "Software" e "Stipendi" → no)
 */
function shouldMergeCategories(a: string, b: string): boolean {
  const na = normalizeCategoryName(a);
  const nb = normalizeCategoryName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Refusi su nomi corti possono essere false positives (es. "Cibo" / "Auto")
  if (na.length < 5 || nb.length < 5) return false;

  const dist = levenshtein(na, nb, 3);
  if (dist <= 2) return true;

  // Prefisso (uno contiene l'altro)
  const short = na.length < nb.length ? na : nb;
  const long = na.length < nb.length ? nb : na;
  if (long.startsWith(short + " ") && long.length - short.length <= 5) {
    return true;
  }

  return false;
}

/**
 * Sceglie il nome canonico in un gruppo di alias. Preferenze:
 *  1. Nome che combacia con una categoria esistente nel DB (se passato)
 *  2. Nome con più righe associate
 *  3. Nome più "pulito" (nessun typo) — euristica: parola completa in italiano,
 *     preferiamo quello con maggior numero di vocali (proxy molto rudimentale).
 *     A parità, il primo in ordine alfabetico.
 */
function pickCanonicalName(
  candidates: Array<{ name: string; count: number }>,
  existingDbNames: Set<string>,
): string {
  // (1) Cerca match esatto con categoria DB
  for (const c of candidates) {
    if (existingDbNames.has(c.name.toLowerCase())) return c.name;
  }
  // (2) Sort per count desc, poi per "naturalezza" (più vocali = più probabile parola completa)
  const sorted = [...candidates].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const va = (a.name.match(/[aeiouAEIOU]/g) ?? []).length;
    const vb = (b.name.match(/[aeiouAEIOU]/g) ?? []).length;
    if (vb !== va) return vb - va;
    return a.name.localeCompare(b.name);
  });
  return sorted[0]?.name ?? "";
}

/**
 * Raggruppa nomi categoria grezzi in proposte canoniche. Usa shouldMergeCategories
 * per fondere refusi/case differenti. Eventuali esistenti nel DB vengono linkate
 * tramite matchesExistingId.
 */
export function buildCategoryProposals(
  rawRows: StoricoRawRow[],
  existingCategories: Array<{ id: string; name: string; type: "income" | "expense" }>,
): CategoryProposal[] {
  // Conteggio per nome grezzo + tipo dominante
  const byRaw = new Map<
    string,
    { income: number; expense: number; total: number }
  >();
  for (const r of rawRows) {
    const k = r.rawCategory;
    if (!byRaw.has(k)) byRaw.set(k, { income: 0, expense: 0, total: 0 });
    const e = byRaw.get(k)!;
    if (r.type === "income") e.income += 1;
    else e.expense += 1;
    e.total += 1;
  }

  // Costruisci gruppi di alias usando union-find naive
  const names = Array.from(byRaw.keys());
  const parent = new Map<string, string>();
  for (const n of names) parent.set(n, n);
  function find(x: string): string {
    let p = parent.get(x)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(x, p);
    return p;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (shouldMergeCategories(names[i], names[j])) {
        union(names[i], names[j]);
      }
    }
  }

  // Raggruppa per root
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const r = find(n);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(n);
  }

  // Set di nomi DB lowercase per match
  const dbNamesLower = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const dbByLower = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c]));

  const proposals: CategoryProposal[] = [];
  for (const aliases of groups.values()) {
    const candidates = aliases.map((a) => ({ name: a, count: byRaw.get(a)!.total }));
    const baseCanonical = pickCanonicalName(candidates, dbNamesLower);

    // (1) Applica rename consigliato dalla knowledge base, controllando TUTTI gli
    //     alias del gruppo (il rename può vincere su qualsiasi raw del gruppo).
    let canonical = baseCanonical;
    let recommendedByKnowledge = false;
    for (const a of aliases) {
      const r = getRecommendedRename(a);
      if (r) {
        canonical = r;
        recommendedByKnowledge = true;
        break;
      }
    }

    // (2) Se la canonical è in FORCED_INCOME_CANONICAL, forza il tipo
    let income = 0;
    let expense = 0;
    let total = 0;
    for (const a of aliases) {
      const e = byRaw.get(a)!;
      income += e.income;
      expense += e.expense;
      total += e.total;
    }
    let type: "income" | "expense" = income > expense ? "income" : "expense";
    if (FORCED_INCOME_CANONICAL.has(canonical)) type = "income";

    // (3) Skip di default per categorie sporche del file (es. "Uscite" aggregato)
    const skipByDefault = aliases.some((a) => shouldSkipByDefault(a));

    // Cerca match con categoria DB esistente sul canonical finale
    const existing = dbByLower.get(canonical.toLowerCase());

    proposals.push({
      canonical,
      sourceNames: aliases.sort((a, b) => byRaw.get(b)!.total - byRaw.get(a)!.total),
      totalRows: total,
      type,
      color: "#6b7280",
      matchesExistingId: existing?.id ?? null,
      recommendedByKnowledge,
      skipByDefault,
    });
  }

  // Ordina per righe coperte (più importanti prima)
  proposals.sort((a, b) => b.totalRows - a.totalRows);
  return proposals;
}

// ===================================================================
// ESTRAZIONE PATTERN
// ===================================================================

/** Token "rumore" bancario da scartare quando si calcola il fingerprint. */
const NOISE_TOKENS = new Set([
  "bonifico", "pagamento", "incasso", "addebito", "accredito", "versamento",
  "sepa", "fatt", "fattura", "del", "al", "da", "in", "per", "via", "c/o",
  "spese", "commissioni", "sdd", "carta", "estratto", "conto", "saldo",
  "rid", "n", "nr", "ord", "ben", "beneficiario", "ordinante", "rif",
  "cro", "iur", "trn", "id", "cod", "codice", "data", "valuta", "dare",
  "avere", "uscita", "entrata", "movimento", "credito", "debito", "cliente",
  "fornitore", "italia", "italy", "spa", "srl", "sas", "snc",
  "dt", "acq", "pos", "merchant",
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
    .split(/[\s.]+/)
    .filter((t) => {
      if (t.length < 3) return false;
      if (/^\d+$/.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (NOISE_TOKENS.has(t)) return false;
      return true;
    });
  return tokens.slice(0, maxTokens).join(" ");
}

/**
 * Estrae pattern affidabili dalle righe già categorizzate.
 *
 * Logica:
 *  - Per ogni riga calcola un fingerprint preferendo la descrizione estesa
 *    (vendor reale, es. "GRENKE LOCAZIONE") perché è più stabile.
 *  - Se la descrizione estesa è troppo generica/vuota, ripiega sulla descrizione.
 *  - Raggruppa per fingerprint, e tiene solo i pattern con:
 *      coverageCount ≥ minCoverage
 *      reliability  ≥ minReliability (top category share)
 *
 * Il nome categoria viene mappato attraverso `rawToCanonical` (perché le
 * categorie sono state già fuse nello step precedente).
 */
export function extractRuleProposals(
  rawRows: StoricoRawRow[],
  rawToCanonical: Map<string, string>, // rawCategoryName → canonicalName
  options: { minCoverage?: number; minReliability?: number } = {},
): RuleProposal[] {
  const minCoverage = options.minCoverage ?? 3;
  const minReliability = options.minReliability ?? 0.75;

  type Bucket = {
    source: "descriptionExt" | "description";
    counts: Map<string, number>; // canonicalName → count
    incomeCount: number;
    expenseCount: number;
    total: number;
  };
  const buckets = new Map<string, Bucket>(); // fingerprint → bucket

  for (const r of rawRows) {
    const fpExt = fingerprint(r.descriptionExt);
    const fpDesc = fingerprint(r.description);
    let chosen: string;
    let source: "descriptionExt" | "description";
    if (fpExt) {
      chosen = fpExt;
      source = "descriptionExt";
    } else if (fpDesc) {
      chosen = fpDesc;
      source = "description";
    } else {
      continue;
    }

    const canonical = rawToCanonical.get(r.rawCategory) ?? r.rawCategory;
    if (!buckets.has(chosen)) {
      buckets.set(chosen, {
        source,
        counts: new Map(),
        incomeCount: 0,
        expenseCount: 0,
        total: 0,
      });
    }
    const b = buckets.get(chosen)!;
    b.counts.set(canonical, (b.counts.get(canonical) ?? 0) + 1);
    if (r.type === "income") b.incomeCount += 1;
    else b.expenseCount += 1;
    b.total += 1;
  }

  const proposals: RuleProposal[] = [];
  for (const [pattern, b] of buckets) {
    if (b.total < minCoverage) continue;
    let topCat: string | null = null;
    let topCount = 0;
    for (const [c, n] of b.counts) {
      if (n > topCount) {
        topCount = n;
        topCat = c;
      }
    }
    if (!topCat) continue;
    const reliability = topCount / b.total;
    if (reliability < minReliability) continue;

    proposals.push({
      pattern,
      origin: "statistical",
      source: b.source,
      coverageCount: topCount,
      reliability,
      canonicalCategoryName: topCat,
      movementType: b.incomeCount > b.expenseCount ? "income" : "expense",
    });
  }

  proposals.sort((a, b) => b.coverageCount - a.coverageCount);
  return proposals;
}

/**
 * Costruisce la mappa rawCategoryName → canonicalName a partire dalle
 * CategoryProposal (utile per estrarre poi i pattern coerenti).
 */
export function buildRawToCanonicalMap(
  proposals: CategoryProposal[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of proposals) {
    for (const src of p.sourceNames) {
      map.set(src, p.canonical);
    }
  }
  return map;
}

// ===================================================================
// REGOLE CURATE (knowledge-base)
// ===================================================================

/**
 * Genera regole CURATE basate sulla knowledge base (VENDOR_RULES).
 * Per ogni VendorRule conta quante righe del file la matchano
 * (descrizione + descrizione estesa, case-insensitive). Restituisce solo
 * quelle che hanno almeno una corrispondenza nel file caricato.
 *
 * A differenza di extractRuleProposals, queste regole:
 *  - hanno reliability fissa = 1.0 (curate da senior)
 *  - sono ordinate per coverageCount, ma sempre prima delle statistical
 *  - sono pre-attivate nel wizard
 */
export function extractCuratedRuleProposals(
  rawRows: StoricoRawRow[],
): RuleProposal[] {
  // Conta hit per ogni VendorRule
  const hits = new Map<VendorRule, number>();
  for (const r of rawRows) {
    const haystack = `${r.description} ${r.descriptionExt}`.toLowerCase();
    for (const rule of VENDOR_RULES) {
      if (haystack.includes(rule.pattern)) {
        hits.set(rule, (hits.get(rule) ?? 0) + 1);
        // Una riga può matchare più regole (es. "amazon" + "paypal *amazon"),
        // ma per il conteggio ci interessa che la regola sia "tirata in ballo".
        // Continuiamo a cercare le altre, così tutte le regole rilevanti
        // appaiono nel wizard.
      }
    }
  }

  const proposals: RuleProposal[] = [];
  for (const [rule, count] of hits) {
    if (count === 0) continue;
    proposals.push({
      pattern: rule.pattern,
      origin: "curated",
      // Le curate non hanno una "source" fissa: il pattern si cerca su
      // descrizione+estesa combinate. Usiamo "descriptionExt" come default
      // perché tipicamente i vendor sono lì.
      source: "descriptionExt",
      coverageCount: count,
      reliability: 1.0,
      canonicalCategoryName: rule.categoryCanonical,
      movementType: rule.movementType,
      label: rule.label,
    });
  }

  proposals.sort((a, b) => b.coverageCount - a.coverageCount);
  return proposals;
}

/**
 * Combina regole curate (knowledge-base) + statistical (estratte dal file),
 * deduplicando per pattern (la curata vince se collide con una statistical).
 */
export function mergeRuleProposals(
  curated: RuleProposal[],
  statistical: RuleProposal[],
): RuleProposal[] {
  const seen = new Set(curated.map((r) => r.pattern.toLowerCase()));
  const merged = [...curated];
  for (const s of statistical) {
    if (seen.has(s.pattern.toLowerCase())) continue;
    merged.push(s);
    seen.add(s.pattern.toLowerCase());
  }
  return merged;
}
