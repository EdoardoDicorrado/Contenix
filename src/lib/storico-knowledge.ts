/**
 * Knowledge base curata per l'import dello storico.
 *
 * Due tipi di conoscenza:
 *
 * 1. RECOMMENDED_RENAMES: mappa nome categoria raw → nome canonico professionale.
 *    Es. "Softwere" → "Software & SaaS", "F24 o simili" → "Imposte e tasse".
 *    Viene applicata DOPO il merge automatico per Levenshtein.
 *
 * 2. VENDOR_RULES: lista di regole vendor → categoria, basate su keyword nella
 *    descrizione estesa o nella descrizione banca. Generano regole pre-attivate
 *    nello step "Regole" del wizard.
 *
 * Queste regole sono curate manualmente per WPaper (web agency), partendo
 * dall'analisi del file "movimenti google.xlsx".
 */

// ===================================================================
// TASSONOMIA CONSIGLIATA: categorie professionali per WPaper
// ===================================================================
//
// Queste sono le categorie "obiettivo" che vogliamo nel DB. Vengono usate
// sia dal wizard storico (come canonical names) sia dal seed manuale
// (pulsante "Inizializza tassonomia" su /regole).

export type TaxonomyEntry = {
  name: string;
  type: "income" | "expense";
  color: string; // hex
};

export const RECOMMENDED_TAXONOMY: TaxonomyEntry[] = [
  // Entrate
  { name: "Ricavi servizi", type: "income", color: "#16a34a" },
  { name: "Storni & rimborsi", type: "income", color: "#22c55e" },
  { name: "Finanziamenti ricevuti", type: "income", color: "#22c55e" },

  // Tecnologia
  { name: "Software & SaaS", type: "expense", color: "#6b7280" },
  { name: "AI Tools", type: "expense", color: "#6b7280" },

  // Marketing
  { name: "Pubblicità & Ads", type: "expense", color: "#6b7280" },

  // Personale
  { name: "Stipendi e collaboratori", type: "expense", color: "#6b7280" },
  { name: "Consulenti esterni", type: "expense", color: "#6b7280" },
  { name: "Buoni pasto", type: "expense", color: "#6b7280" },

  // Operatività
  { name: "Affitto ufficio", type: "expense", color: "#6b7280" },
  { name: "Utenze ufficio", type: "expense", color: "#6b7280" },
  { name: "Telefonia & Internet", type: "expense", color: "#6b7280" },
  { name: "Acquisti ufficio", type: "expense", color: "#6b7280" },
  { name: "Acquisti generici", type: "expense", color: "#6b7280" },

  // Veicoli
  { name: "Carburante", type: "expense", color: "#6b7280" },
  { name: "Assicurazione auto", type: "expense", color: "#6b7280" },

  // Trasferte
  { name: "Trasferte", type: "expense", color: "#6b7280" },
  { name: "Cibo & ristoranti", type: "expense", color: "#6b7280" },

  // Fisco / Bancario
  { name: "Imposte e tasse", type: "expense", color: "#6b7280" },
  { name: "Commissioni bancarie", type: "expense", color: "#6b7280" },
  { name: "Interessi mutuo", type: "expense", color: "#6b7280" },

  // Servizi
  { name: "Noleggio attrezzature", type: "expense", color: "#6b7280" },
  { name: "Associazioni e quote", type: "expense", color: "#6b7280" },

  // Trasferimenti (provvisori, da convertire in transfer rules quando il conto destinazione esiste)
  { name: "Trasferimenti a Revolut", type: "expense", color: "#9ca3af" },
  { name: "Trasferimenti carta di credito", type: "expense", color: "#9ca3af" },

  // Triage
  { name: "Da rivedere", type: "expense", color: "#9ca3af" },
];

// ===================================================================
// RENAME CONSIGLIATI: raw category name → canonical professionale
// ===================================================================
//
// Tutto in minuscolo a sinistra; match case-insensitive.
// Sul lato destro c'è il NOME finale che proporremo nel wizard.
// L'utente può sempre sovrascrivere.

export const RECOMMENDED_RENAMES: Record<string, string> = {
  // Entrate
  "entrate": "Ricavi servizi",
  "storno": "Storni & rimborsi",
  "stornati": "Storni & rimborsi",

  // Tecnologia
  "softwere": "Software & SaaS",
  "software": "Software & SaaS",
  "google base": "Software & SaaS",
  "scalapay": "Software & SaaS", // di solito è SaaS per WPaper, sennò l'utente cambia
  "softwere ai": "AI Tools",
  "software ai": "AI Tools",

  // Marketing
  "ads generali": "Pubblicità & Ads",

  // Personale
  "stipendi": "Stipendi e collaboratori",
  "consulenti": "Consulenti esterni",
  "buoni pasto": "Buoni pasto",

  // Operatività (split: affitto vs utenze)
  "affitto e energie": "Utenze ufficio",
  "affitto e energia": "Utenze ufficio",
  "cellulari + utenze": "Telefonia & Internet",
  "cellulari + utenze ": "Telefonia & Internet",
  "internet": "Telefonia & Internet",
  "acquisti": "Acquisti ufficio",
  "acquisti online": "Acquisti generici",

  // Veicoli
  "carta carburante": "Carburante",
  "assicurazione macchina": "Assicurazione auto",

  // Trasferte
  "trasferte": "Trasferte",
  "cibo": "Cibo & ristoranti",

  // Fisco / Bancario
  "f24 o simili": "Imposte e tasse",
  "tasse bancarie": "Imposte e tasse",
  "commisioni bancarie": "Commissioni bancarie",
  "commissioni bancarie": "Commissioni bancarie",
  "rate finanziamenti": "Interessi mutuo",

  // Servizi
  "noleggio": "Noleggio attrezzature",
  "associazioni": "Associazioni e quote",

  // Triage
  "da rivedere": "Da rivedere",
  "non categorizzata": "Da rivedere",

  // Trasferimenti (verranno gestiti dopo come transfer rules)
  "revolut": "Trasferimenti a Revolut",
};

export function getRecommendedRename(rawName: string): string | null {
  const k = rawName.trim().toLowerCase();
  return RECOMMENDED_RENAMES[k] ?? null;
}

// ===================================================================
// CATEGORIE FORZATE A INCOME (override del segno autodetect)
// ===================================================================
//
// Storni e rimborsi: nel file sono "USCITA" come segno, ma concettualmente
// sono entrate (refund di pagamenti POS). Li trattiamo come income.

export const FORCED_INCOME_CANONICAL = new Set<string>([
  "Ricavi servizi",
  "Storni & rimborsi",
]);

// ===================================================================
// CATEGORIE DA ESCLUDERE DI DEFAULT (skip=true nel wizard)
// ===================================================================
//
// "Uscite" nel file è 1 sola riga da €21k — sembra un totale aggregato
// sporco, non un vero movimento. Skippiamo di default.

export const RAW_CATEGORIES_TO_SKIP = new Set<string>([
  "uscite",
]);

export function shouldSkipByDefault(rawName: string): boolean {
  return RAW_CATEGORIES_TO_SKIP.has(rawName.trim().toLowerCase());
}

// ===================================================================
// VENDOR RULES: keyword → categoria proposta
// ===================================================================
//
// Ogni regola dice: "se la descrizione (banca+estesa) contiene questo
// keyword, assegna questa categoria canonica". Le regole sono ordinate
// per priorità — la prima che matcha vince. Quindi le più specifiche
// vanno PRIMA (es. "uta mobility" prima di "edenred").

export type VendorRule = {
  /** Keyword da cercare (lowercase, deve apparire nel testo combinato) */
  pattern: string;
  /** Nome categoria canonica (deve esistere o essere nella tassonomia) */
  categoryCanonical: string;
  /** Tipo movimento dominante */
  movementType: "income" | "expense";
  /** Descrizione human-readable della regola */
  label: string;
};

export const VENDOR_RULES: VendorRule[] = [
  // ============================================================
  // PRIORITÀ MASSIMA: pattern banca che devono SEMPRE vincere
  // ============================================================
  // Le commissioni dei bonifici contengono i nomi dei beneficiari (es. la
  // commissione del bonifico stipendio contiene "Magda Balduzzi"), quindi
  // queste regole DEVONO essere matchate PRIMA dei nomi persona.

  // Commissioni bancarie (devono vincere sui nomi)
  { pattern: "costo pag.istantaneo", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Costo bonifico stipendio" },
  { pattern: "costo bonifico", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Costo bonifico" },
  { pattern: "commissione disposizione", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Commissione bonifico" },
  { pattern: "commissione pagamento adue", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Commissione ADUE" },
  { pattern: "commissione pagamento cbill", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Commissione CBill" },
  { pattern: "commissioni e spese adue", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Commissioni ADUE" },
  { pattern: "maggiorazione bonifico", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Maggiorazione bonifico" },
  { pattern: "imposta di bollo", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Bollo conto" },
  { pattern: "canone mensile base", categoryCanonical: "Commissioni bancarie", movementType: "expense", label: "Canone c/c" },

  // Imposte F24/PA (anch'esse spesso aggregate, devono vincere)
  { pattern: "pagamento delega f24", categoryCanonical: "Imposte e tasse", movementType: "expense", label: "F24" },
  { pattern: "add. deleghe fisco", categoryCanonical: "Imposte e tasse", movementType: "expense", label: "Deleghe fisco" },

  // Storni (income, ma il pattern deve catturare le righe "STORNO PAGAMENTO POS")
  { pattern: "storno pagamento pos", categoryCanonical: "Storni & rimborsi", movementType: "income", label: "Storno POS" },

  // Mutuo (descrizione contiene "QUOTA CAPITALE" + numeri)
  { pattern: "mutuo 00/", categoryCanonical: "Interessi mutuo", movementType: "expense", label: "Rata mutuo" },
  { pattern: "quota capitale", categoryCanonical: "Interessi mutuo", movementType: "expense", label: "Rata mutuo (quota capitale)" },

  // Ricavi (devono vincere su altri match income)
  { pattern: "accredito beu", categoryCanonical: "Ricavi servizi", movementType: "income", label: "Bonifico cliente" },
  { pattern: "accredito bonifico istantaneo", categoryCanonical: "Ricavi servizi", movementType: "income", label: "Bonifico istantaneo cliente" },

  // Finanziamenti ricevuti (erogazioni bancarie)
  { pattern: "erogazione finanziamento", categoryCanonical: "Finanziamenti ricevuti", movementType: "income", label: "Erogazione finanziamento" },

  // Saldo carta di credito → trasferimento provvisorio (da convertire poi in transfer rule reale)
  { pattern: "addebito saldo e/c carta di credito", categoryCanonical: "Trasferimenti carta di credito", movementType: "expense", label: "Saldo carta di credito" },
  { pattern: "saldo e/c carta di credito", categoryCanonical: "Trasferimenti carta di credito", movementType: "expense", label: "Saldo carta di credito" },

  // ============================================================
  // VENDOR-BASED (dalla descrizione estesa)
  // ============================================================

  // --- AI Tools (alta specificità) ---
  { pattern: "anthropic", categoryCanonical: "AI Tools", movementType: "expense", label: "Anthropic Claude" },
  { pattern: "claude.ai", categoryCanonical: "AI Tools", movementType: "expense", label: "Claude.ai subscription" },
  { pattern: "openai", categoryCanonical: "AI Tools", movementType: "expense", label: "OpenAI / ChatGPT" },
  { pattern: "chatgpt", categoryCanonical: "AI Tools", movementType: "expense", label: "ChatGPT subscription" },
  { pattern: "augmentai", categoryCanonical: "AI Tools", movementType: "expense", label: "Augment AI" },

  // --- Pubblicità (specifiche prima) ---
  { pattern: "google ads", categoryCanonical: "Pubblicità & Ads", movementType: "expense", label: "Google Ads" },
  { pattern: "facebk", categoryCanonical: "Pubblicità & Ads", movementType: "expense", label: "Facebook/Meta Ads" },
  { pattern: "metapay", categoryCanonical: "Pubblicità & Ads", movementType: "expense", label: "Meta Pay" },

  // --- Google Workspace/Cloud (vanno DOPO 'google ads') ---
  { pattern: "gsuite", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Google Workspace" },
  { pattern: "google cloud", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Google Cloud" },
  { pattern: "google*gsuite", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Google Workspace (POS)" },
  { pattern: "google*cloud", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Google Cloud (POS)" },

  // --- Software & SaaS ---
  { pattern: "vercel", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Vercel hosting" },
  { pattern: "figma", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Figma" },
  { pattern: "ionos", categoryCanonical: "Software & SaaS", movementType: "expense", label: "IONOS hosting" },
  { pattern: "plesk", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Plesk" },
  { pattern: "litespeed", categoryCanonical: "Software & SaaS", movementType: "expense", label: "LiteSpeed" },
  { pattern: "lemonsqueez", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Lemon Squeezy" },
  { pattern: "paddle.net", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Paddle.net" },
  { pattern: "poppix", categoryCanonical: "Software & SaaS", movementType: "expense", label: "Poppix" },

  // --- Telefonia & Internet (Dimensione PRIMA di altri, è il provider internet) ---
  { pattern: "dimensione s.r.l.", categoryCanonical: "Telefonia & Internet", movementType: "expense", label: "Dimensione (internet ufficio)" },
  { pattern: "telecom italia", categoryCanonical: "Telefonia & Internet", movementType: "expense", label: "TIM" },
  { pattern: "tim s p a", categoryCanonical: "Telefonia & Internet", movementType: "expense", label: "TIM" },
  { pattern: "vodafone", categoryCanonical: "Telefonia & Internet", movementType: "expense", label: "Vodafone" },
  { pattern: "iliad", categoryCanonical: "Telefonia & Internet", movementType: "expense", label: "Iliad" },

  // --- Utenze ufficio (tutte le bollette: luce, gas, acqua) ---
  // NB: "hera s" matcha sia "HERA SPA" che "HERA S.P.A." (con punti)
  { pattern: "hera s", categoryCanonical: "Utenze ufficio", movementType: "expense", label: "Hera (utenze)" },
  { pattern: "sorgenia", categoryCanonical: "Utenze ufficio", movementType: "expense", label: "Sorgenia" },
  { pattern: "bolletta elettrica", categoryCanonical: "Utenze ufficio", movementType: "expense", label: "Bolletta elettrica" },

  // --- Affitto ufficio ---
  { pattern: "alessandro rossetti", categoryCanonical: "Affitto ufficio", movementType: "expense", label: "Affitto ufficio (Rossetti)" },
  { pattern: "studio condomini", categoryCanonical: "Affitto ufficio", movementType: "expense", label: "Condominio ufficio" },

  // --- Noleggio attrezzature ---
  { pattern: "grenke", categoryCanonical: "Noleggio attrezzature", movementType: "expense", label: "Grenke Locazione" },

  // --- Buoni pasto (Edenred Italia, distinto da UTA Mobility) ---
  { pattern: "edenred italia", categoryCanonical: "Buoni pasto", movementType: "expense", label: "Edenred Italia (buoni pasto)" },
  { pattern: "#edenred", categoryCanonical: "Buoni pasto", movementType: "expense", label: "Edenred POS" },

  // --- Carburante (UTA Mobility = carta carburante Edenred) ---
  { pattern: "uta mobility", categoryCanonical: "Carburante", movementType: "expense", label: "Edenred UTA (carta carburante)" },
  { pattern: " eni ", categoryCanonical: "Carburante", movementType: "expense", label: "ENI distributore" },
  { pattern: "eni pv", categoryCanonical: "Carburante", movementType: "expense", label: "ENI distributore" },
  { pattern: "esso ", categoryCanonical: "Carburante", movementType: "expense", label: "ESSO distributore" },

  // --- Assicurazione auto ---
  { pattern: "linear assicurazioni", categoryCanonical: "Assicurazione auto", movementType: "expense", label: "Linear" },
  { pattern: "prima it", categoryCanonical: "Assicurazione auto", movementType: "expense", label: "Prima" },

  // --- Trasferte (Trenitalia, taxi, hotel, parking) ---
  { pattern: "trenit", categoryCanonical: "Trasferte", movementType: "expense", label: "Trenitalia" },
  { pattern: "consorzio.taxi", categoryCanonical: "Trasferte", movementType: "expense", label: "Taxi" },
  { pattern: "parking", categoryCanonical: "Trasferte", movementType: "expense", label: "Parcheggi" },
  { pattern: "airbnb", categoryCanonical: "Trasferte", movementType: "expense", label: "Airbnb" },
  { pattern: "park hotel", categoryCanonical: "Trasferte", movementType: "expense", label: "Park Hotel (alloggio)" },
  { pattern: "hotel-spaziocmm", categoryCanonical: "Trasferte", movementType: "expense", label: "Hotel Spazio" },
  { pattern: "rentcars", categoryCanonical: "Trasferte", movementType: "expense", label: "RentCars" },

  // --- Cibo & ristoranti (Deliveroo, ristoranti, supermercati durante viaggi) ---
  { pattern: "deliveroo", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Deliveroo" },
  { pattern: "biopizza", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Ristorante" },
  { pattern: "gelateria", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Gelaterie" },
  { pattern: "autogrill", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Autogrill" },
  { pattern: "famila", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Supermercato Famila" },
  { pattern: "conad", categoryCanonical: "Cibo & ristoranti", movementType: "expense", label: "Conad" },

  // --- Acquisti ufficio ---
  { pattern: "nespresso", categoryCanonical: "Acquisti ufficio", movementType: "expense", label: "Nespresso" },
  { pattern: "mistercredit", categoryCanonical: "Acquisti ufficio", movementType: "expense", label: "MisterCredit" },

  // --- Acquisti generici (marketplace) ---
  { pattern: "amazon", categoryCanonical: "Acquisti generici", movementType: "expense", label: "Amazon" },
  { pattern: "amzn", categoryCanonical: "Acquisti generici", movementType: "expense", label: "Amazon" },
  { pattern: "scalapay", categoryCanonical: "Acquisti generici", movementType: "expense", label: "Scalapay" },
  { pattern: "klarna", categoryCanonical: "Acquisti generici", movementType: "expense", label: "Klarna" },
  { pattern: "ldlc", categoryCanonical: "Acquisti generici", movementType: "expense", label: "LDLC" },

  // --- Associazioni ---
  { pattern: "upsa confartigianato", categoryCanonical: "Associazioni e quote", movementType: "expense", label: "UPSA Confartigianato" },
  { pattern: "confartigianato", categoryCanonical: "Associazioni e quote", movementType: "expense", label: "Confartigianato" },

  // --- Stipendi e collaboratori (nomi specifici) ---
  // I bonifici a queste persone vanno sempre come Stipendi/collab.
  { pattern: "magda balduzzi", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Magda Balduzzi" },
  { pattern: "ilaria rossetti", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Ilaria Rossetti" },
  { pattern: "ibatici", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Daniele Ibatici" },
  { pattern: "alin sfirschi", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Alin Sfirschi" },
  { pattern: "di corrado", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Edoardo Di Corrado" },
  { pattern: "marcella martino", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Marcella Martino" },
  { pattern: "alice ottini", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Alice Ottini" },
  { pattern: "claudia labati", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Claudia Labati" },
  { pattern: "alessandro gaetano", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Alessandro Gaetano" },

  // --- Consulenti esterni (nomi specifici) ---
  { pattern: "bucchioni", categoryCanonical: "Consulenti esterni", movementType: "expense", label: "Enrico Bucchioni (commercialista)" },
  { pattern: "cdg service", categoryCanonical: "Consulenti esterni", movementType: "expense", label: "CDG Service (consulenza lavoro)" },
  { pattern: "erre emme elaborazion", categoryCanonical: "Consulenti esterni", movementType: "expense", label: "Erre Emme" },

  // --- Trasferimenti interni (ricariche Revolut, bonifici a se stessi) ---
  // Provvisori: andranno convertiti in transfer rules vere quando crei il conto Revolut.
  { pattern: "white paper srl ricarica", categoryCanonical: "Trasferimenti a Revolut", movementType: "expense", label: "Ricarica Revolut" },
  { pattern: "white paper srl  ricarica", categoryCanonical: "Trasferimenti a Revolut", movementType: "expense", label: "Ricarica Revolut" },

  // --- Imposte (CBill verso PA italiane) ---
  { pattern: "agenzia delle entrate", categoryCanonical: "Imposte e tasse", movementType: "expense", label: "Agenzia Entrate" },
  { pattern: "comune di piacenza", categoryCanonical: "Imposte e tasse", movementType: "expense", label: "Comune di Piacenza" },

  // --- Stipendi quando la banca lo dichiara esplicitamente ---
  { pattern: "pagamento istantaneo stipendio", categoryCanonical: "Stipendi e collaboratori", movementType: "expense", label: "Stipendi (etichetta banca)" },
];

/**
 * Cerca la prima regola che matcha nel testo combinato (descrizione + descrizione estesa).
 * Restituisce la regola o null. Case-insensitive.
 */
export function matchVendorRule(combinedText: string): VendorRule | null {
  const text = combinedText.toLowerCase();
  for (const rule of VENDOR_RULES) {
    if (text.includes(rule.pattern)) return rule;
  }
  return null;
}
