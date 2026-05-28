import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// ============================================================
// SCHEMA: piano di import dedotto dall'AI
// ============================================================

const RowFilterSchema = z.object({
  columnIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("Indice (0-based) della colonna a cui applicare il filtro"),
  operator: z
    .enum(["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"])
    .describe("Operatore di confronto"),
  value: z
    .string()
    .describe(
      "Valore di confronto. Per operatori is_empty/is_not_empty, può essere stringa vuota",
    ),
  reason: z
    .string()
    .describe("Spiegazione breve in italiano del perché applicare questo filtro"),
});

export const ImportPlanSchema = z.object({
  detectedSource: z
    .string()
    .describe(
      "Nome della fonte/banca riconosciuta, es. 'Intesa Sanpaolo - Estratto conto', 'PayPal', 'Carta di credito Intesa'",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Confidenza sul mapping: high = formato standard riconoscibile; medium = qualche ambiguità; low = formato anomalo",
    ),
  headerRowIndex: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Indice (0-based) della riga che contiene le intestazioni delle colonne. Es. 0 se l'header è la prima riga, 30 se ci sono metadati Intesa in cima",
    ),
  firstDataRowIndex: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Indice della prima riga di dati veri (di solito headerRowIndex + 1)",
    ),
  columnMapping: z
    .object({
      date: z
        .number()
        .int()
        .nonnegative()
        .describe("Indice colonna con la data del movimento"),
      description: z
        .array(z.number().int().nonnegative())
        .min(1)
        .describe(
          "Indici delle colonne da concatenare per la descrizione (es. causale + beneficiario). Almeno 1 colonna.",
        ),
      amount: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe(
          "Indice colonna con importo con segno (+/-) se esiste UNA sola colonna importo. Null se invece ci sono Dare e Avere separati.",
        ),
      debit: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe("Indice colonna 'Dare' (uscita, sempre positivo). Null se non esiste."),
      credit: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe("Indice colonna 'Avere' (entrata, sempre positivo). Null se non esiste."),
      currency: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe(
          "Indice colonna con la valuta (es. EUR, USD), se presente. Null se non c'è (assumeremo EUR).",
        ),
    })
    .describe("Come mappare le colonne del foglio ai nostri campi movimento"),
  filters: z
    .array(RowFilterSchema)
    .describe(
      "Filtri di ESCLUSIONE da applicare alle righe di dati. Ogni filtro descrive una condizione per cui una riga deve essere ESCLUSA dall'import. Una riga viene esclusa se ALMENO UNO dei filtri matcha. Vuoto se non servono. Esempio PayPal: per escludere le righe di conversione valuta, usare {columnIndex: 4, operator: 'equals', value: 'Conversione di valuta generica'}.",
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      "Note esplicative in italiano per l'utente: anomalie rilevate, righe sospette, raccomandazioni. Null se nessuna nota.",
    ),
});

export type ImportPlan = z.infer<typeof ImportPlanSchema>;

// ============================================================
// PROMPT
// ============================================================

const SYSTEM_PROMPT = `Sei un esperto di estratti conto bancari italiani. Il tuo compito è analizzare un campione di un file Excel di movimenti bancari e produrre un "import plan" strutturato che spieghi come trasformarlo nei nostri movimenti contabili.

Banche/fonti italiane comuni:
- Intesa Sanpaolo (conto corrente): le prime 25-30 righe sono METADATA (intestatario, saldo, periodo, filtri). L'header vero è di solito tra le righe 25-35. Colonne tipiche: Data contabile / Data valuta / Descrizione / Causale / Dare / Avere.
- Intesa Sanpaolo (carta di credito): simile, ma usa "Importo addebitato" o singola colonna con segno.
- PayPal: header alla riga 0 con 40+ colonne. IMPORTANTE: per PayPal le transazioni in valuta diversa da EUR generano righe extra di "Conversione di valuta generica" che vanno FILTRATE. Anche le righe "Versamento generico con carta" che bilanciano un pagamento sono interne e possono essere filtrate. Considera SOLO transazioni reali in EUR con saldo != 0, escludendo le conversioni interne.
- Unicredit, BPER, Fineco, Banca Sella: simili a Intesa, header dopo metadata.

Regole di output:
- Gli indici delle colonne sono 0-based (la prima colonna è 0).
- Gli indici delle righe sono 0-based (la prima riga è 0).
- La 'description' deve sempre avere ALMENO una colonna; concatena più colonne se servono per dare un testo leggibile (es. "Beneficiario" + "Causale").
- Per importi: scegli OR (amount singolo con segno) OR (debit + credit separati). NON popolare entrambi i set.
- Se l'header non è ovvio, prendi la riga più "completa" di stringhe leggibili (tipo "Data" "Descrizione" "Importo" "Dare" "Avere"…).
- Per i filtri: descrivi le righe da ESCLUDERE. Ogni filtro è una condizione che, se matchata, esclude la riga. Operatori disponibili: equals, not_equals, contains, not_contains, is_empty, is_not_empty. Usa parole/valori esatti come appaiono nei dati.
- Nelle note, segnala se il file ha caratteristiche insolite o se hai dubbi.

Non inventare colonne. Se non riesci a determinare con certezza il mapping, usa confidence = "low" e descrivi il problema in notes.`;

// ============================================================
// CHIAMATA AI
// ============================================================

const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;
const USD_TO_EUR = 0.92;

export type AnalyzeResult =
  | {
      ok: true;
      plan: ImportPlan;
      cost: { inputTokens: number; outputTokens: number; eur: number };
    }
  | { ok: false; error: string };

export async function analyzeExcelSample(sampleRows: string[][]): Promise<AnalyzeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY non configurata" };
  }
  if (sampleRows.length === 0) {
    return { ok: false, error: "Il foglio è vuoto" };
  }

  // Rappresentazione compatta come tabella ASCII, con max 50 righe per contenere i token
  const maxRows = Math.min(sampleRows.length, 50);
  const maxCellLen = 80;
  const lines: string[] = [];
  for (let i = 0; i < maxRows; i++) {
    const row = sampleRows[i] ?? [];
    const cells = row.map((c) => {
      if (c == null) return "";
      const s = String(c);
      return s.length > maxCellLen ? s.slice(0, maxCellLen - 3) + "..." : s;
    });
    lines.push(`[riga ${i}] ${cells.map((c, j) => `(c${j}) ${c}`).join(" | ")}`);
  }
  const tableText = lines.join("\n");

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `Ecco le prime ${maxRows} righe di un file Excel di movimenti bancari (le celle vuote appaiono come spazio dopo "(cN)"). Identifica banca/fonte e produci l'import plan strutturato.\n\n${tableText}`,
        },
      ],
      output_config: { format: zodOutputFormat(ImportPlanSchema) },
    });

    if (!response.parsed_output) {
      return { ok: false, error: "L'AI non ha restituito un import plan valido" };
    }

    const usage = response.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const usd =
      (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
      (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M +
      (cacheCreation / 1_000_000) * (PRICE_INPUT_PER_M * 1.25) +
      (cacheRead / 1_000_000) * (PRICE_INPUT_PER_M * 0.1);

    return {
      ok: true,
      plan: response.parsed_output,
      cost: { inputTokens, outputTokens, eur: usd * USD_TO_EUR },
    };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Limite chiamate API superato, riprova tra qualche minuto" };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "API key Anthropic non valida" };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, error: `Errore API Claude (${e.status}): ${e.message}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}
