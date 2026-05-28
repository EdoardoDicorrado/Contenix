import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Prezzi Sonnet 4.6 (USD per 1M token) — aggiornati alla data di costruzione
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;
const PRICE_CACHE_WRITE_PER_M = 3.75; // 1.25× input
const PRICE_CACHE_READ_PER_M = 0.3; // 0.1× input
const USD_TO_EUR = 0.92; // approssimato — solo per stima utente

export const InvoiceExtractionSchema = z.object({
  number: z.string().describe("Numero della fattura come riportato nel documento"),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data emissione in formato YYYY-MM-DD"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("Data scadenza pagamento in formato YYYY-MM-DD, null se non specificata"),
  counterpartyName: z
    .string()
    .describe("Nome o denominazione del cedente/fornitore (chi emette la fattura)"),
  counterpartyVat: z
    .string()
    .nullable()
    .describe("Partita IVA del cedente con prefisso paese (es. IT12345678901), null se non leggibile"),
  totalAmount: z.number().positive().describe("Importo totale del documento in valuta indicata"),
  vatAmount: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Totale IVA. Null se la fattura è esente IVA o senza IVA"),
  currency: z
    .string()
    .length(3)
    .describe("Codice valuta ISO 4217 a 3 lettere (di norma EUR)"),
  description: z
    .string()
    .describe(
      "Sommario testuale del contenuto fatturato: cosa è stato venduto/acquistato. Massimo 500 caratteri. Se ci sono più righe nella fattura, concatenarle separate da ' · '. Es: 'Realizzazione landing page Seta Beauty Clinic e campagna Ads · Configurazione hosting'.",
    ),
  paymentIban: z
    .string()
    .nullable()
    .describe(
      "IBAN del beneficiario indicato per il pagamento (formato standard IBAN, max 34 caratteri). Null se non presente o illeggibile.",
    ),
  documentType: z
    .string()
    .nullable()
    .describe(
      "Codice tipo documento FatturaPA (TD01-TD28) se indicato. Es: TD01=fattura, TD04=nota di credito, TD05=nota di debito. Null se non rilevabile o non applicabile.",
    ),
  paymentMethod: z
    .string()
    .nullable()
    .describe(
      "Codice modalità di pagamento FatturaPA (MP01-MP23) se indicato. Es: MP05=bonifico, MP08=carta di credito. Null se non rilevabile.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Tua confidenza sull'estrazione complessiva. high = tutti i campi chiaramente leggibili; medium = qualche ambiguità; low = documento sporco o parzialmente illeggibile",
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      "Eventuali note sull'estrazione: campi ambigui, formato insolito, sospetti di errore. Null se nessuna nota.",
    ),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

const SYSTEM_PROMPT = `Sei un esperto contabile italiano specializzato nell'estrazione di dati strutturati da fatture commerciali (italiane ed estere).

Il tuo compito è leggere il PDF allegato e restituire i campi della fattura nel formato JSON richiesto.

Regole importanti:
- DATE: usa sempre formato ISO YYYY-MM-DD. Le fatture italiane spesso usano DD/MM/YYYY; convertile.
- IMPORTI: usa il numero decimale con punto (1234.56), non virgola.
- PARTITA IVA: aggiungi sempre il prefisso del paese di 2 lettere (es. "IT12345678901", "DE123456789"). Se non leggi il prefisso ma la P.IVA è italiana di 11 cifre, anteponi "IT".
- VALUTA: codice ISO 4217 a 3 lettere maiuscole (EUR, USD, GBP, CHF, ecc.).
- CONTROPARTE: il cedente/prestatore (chi emette la fattura), NON il cessionario/committente.
- SCADENZA: se non c'è una data esplicita, ritorna null. Non inventare scadenze dedotte da "30 giorni d.f." senza calcolarle.
- IVA: se la fattura è esente, in reverse charge, o senza IVA, ritorna vatAmount = null.
- NUMERO FATTURA: esattamente come scritto nel documento, inclusi separatori e prefissi (es. "2025/F/0042", "FA-128").
- DESCRIZIONE: leggi le righe di dettaglio (DettaglioLinee/voci/righe) e crea un sommario in italiano del contenuto fatturato. Concatena le descrizioni delle righe principali separate da ' · '. Max ~500 caratteri. Ignora righe ausiliarie/tecniche (es. "informazioni documento", "tipo riga ausiliaria").
- IBAN: estrai il codice IBAN del beneficiario se presente (cerca termini "IBAN", "Coordinate bancarie", "Banca"). Mantieni il formato originale senza spazi.
- TIPO DOCUMENTO: se vedi codici come TD01, TD04, TD05, ecc., riportali. Altrimenti null.
- MODALITÀ PAGAMENTO: se vedi codici come MP05, MP08, ecc., riportali. Altrimenti null.

Se un campo è davvero illeggibile, indica confidence = "low" e descrivi il problema in notes. Non inventare dati.`;

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  costEur: number;
};

export type ExtractionResult =
  | { ok: true; data: InvoiceExtraction; usage: AiUsage }
  | { ok: false; error: string };

function computeCost(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): AiUsage {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const costUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M +
    (cacheCreationTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_M +
    (cacheReadTokens / 1_000_000) * PRICE_CACHE_READ_PER_M;

  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd,
    costEur: costUsd * USD_TO_EUR,
  };
}

/**
 * Estrae i dati strutturati da un PDF di fattura via Claude API.
 *
 * Caching strategy: il system prompt è marcato come `cache_control: ephemeral`
 * → su fatture caricate ravvicinatamente (stesso fornitore o batch) i token del
 * prompt si pagano ~0.1× invece di 1×, ammortizzando il costo.
 *
 * Il PDF stesso NON è caricato — cambia ogni volta, non è cacheable.
 */
export async function extractInvoiceFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY non configurata" };
  }

  const sizeMb = pdfBuffer.byteLength / (1024 * 1024);
  if (sizeMb > 32) {
    return {
      ok: false,
      error: `PDF troppo grande (${sizeMb.toFixed(1)}MB). Limite Claude API: 32MB.`,
    };
  }

  const client = new Anthropic();
  const base64Pdf = pdfBuffer.toString("base64");

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: "Estrai i dati di questa fattura nel formato JSON richiesto. Rispetta tutte le regole indicate nel system prompt.",
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(InvoiceExtractionSchema),
      },
    });

    if (!response.parsed_output) {
      return {
        ok: false,
        error:
          "L'AI non ha restituito un JSON valido. Il PDF potrebbe essere illeggibile o non essere una fattura.",
      };
    }

    return {
      ok: true,
      data: response.parsed_output,
      usage: computeCost(response.usage),
    };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Limite di chiamate API superato. Riprova tra qualche minuto." };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "API key Anthropic non valida. Verifica .env.local." };
    }
    if (e instanceof Anthropic.BadRequestError) {
      return { ok: false, error: `Richiesta non valida: ${e.message}` };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, error: `Errore API Claude (${e.status}): ${e.message}` };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore sconosciuto durante l'estrazione AI",
    };
  }
}

/**
 * Stima il costo prima di chiamare l'API basandosi sulla dimensione del PDF.
 * Euristica grossolana ma utile per mostrare un range all'utente prima di confermare.
 */
export function estimateCostUsd(pdfSizeBytes: number): { min: number; max: number } {
  // PDF tipici: ~500-2000 token per pagina, fattura 1-2 pagine = ~1500-5000 token input
  // + system prompt ~600 token + output ~500 token
  const sizeKb = pdfSizeBytes / 1024;
  const estimatedInputTokens = Math.max(2000, Math.min(15000, sizeKb * 8));
  const outputTokens = 500;

  const min =
    (estimatedInputTokens * 0.7 * PRICE_INPUT_PER_M + outputTokens * PRICE_OUTPUT_PER_M) /
    1_000_000;
  const max =
    (estimatedInputTokens * 1.3 * PRICE_INPUT_PER_M + outputTokens * PRICE_OUTPUT_PER_M) /
    1_000_000;

  return { min, max };
}
