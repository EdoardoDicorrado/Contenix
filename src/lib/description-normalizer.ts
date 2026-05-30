/**
 * Normalizer descrizioni movimenti bancari.
 *
 * Filosofia: PATTERN-EXTRACTION, NOT BLACKLIST-REMOVAL.
 *
 * Riconosciamo solo pattern bancari noti al 100% (marker testuali univoci
 * tipo "PRESSO" o "NOME: … MANDATO:") ed estraiamo la parte significativa.
 * Per tutto il resto restituiamo la descrizione **identica all'originale**
 * — mai inventare cleanup parziale "tanto perché".
 *
 * Garanzie:
 *  - Se il gruppo estratto è < 3 char → fallback su originale
 *  - L'originale resta sempre in DB; questa funzione popola solo `description_clean`
 */

// I gruppi sono numbered (non named) per compatibilità target ES2017.

// POS Intesa: "PAGAMENTO POS — EFFETTUATO IL … MEDIANTE LA CARTA … PRESSO <X>"
// Gruppo 1: merchant
const POS_PATTERN = /^PAGAMENTO POS\s*[—\-]\s*EFFETTUATO IL .+?\bPRESSO\s+(.+?)\s*$/i;

// POS estero: come POS ma con suffisso "(CTV. DI <amount> USD AL ...)"
// Gruppo 1: merchant (fermare prima di "(CTV.")
const POS_ESTERO_PATTERN =
  /^PAGAMENTO\s+EFFETTUATO\s+SU\s+POS\s+ESTERO\s*[—\-]\s*EFFETTUATO IL .+?\bPRESSO\s+(.+?)(?:\s*\(\s*CTV\.|$)/i;

// ADUE: "[COMMISSIONI E SPESE | COMMISSIONE | PAGAMENTO] ADUE [B2B] — COD. DISP.: <num> NOME: <X> MANDATO: <num>"
// Gruppo 1: prefisso commissione (se presente)
// Gruppo 2: name
const ADUE_PATTERN =
  /^(COMMISSIONI?\s+E\s+SPESE\s+|COMMISSIONE\s+)?(?:PAGAMENTO\s+)?ADUE(?:\s+B2B)?\s*[—\-]\s*COD\.?\s*DISP\.?:\s*\S+\s+NOME:\s*(.+?)\s+MANDATO:\s*\S+/i;

// Bonifico in uscita: tutto dopo "a favore di:"
// Gruppo 1: rest (nome + causale)
const BONIFICO_USCITA_PATTERN =
  /\bBonifico da Voi disposto a favore di:\s*(.+?)\s*$/i;

// Accredito incoming: "MITT.: <X> BENEF.: …" o "BIC." o fine
// Gruppo 1: mittente
const ACCREDITO_PATTERN = /\bMITT\.?:\s*(.+?)(?=\s+BENEF\.?:|\s+BIC\.|\s*$)/i;
const ACCREDITO_GUARD = /\bACCREDITO\b|\bBonifico a Vostro favore\b/i;

const MIN_LENGTH = 3;

export type NormalizationResult = {
  /** Descrizione finale: pulita se un pattern ha matchato, altrimenti originale. */
  clean: string;
  /** true se è stato applicato un pattern di pulizia. */
  changed: boolean;
  /** Quale pattern ha matchato (per debug/audit). */
  pattern:
    | "pos"
    | "pos-estero"
    | "adue"
    | "adue-commission"
    | "bonifico-uscita"
    | "accredito"
    | null;
};

export function normalizeBankDescription(raw: string): NormalizationResult {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return { clean: raw, changed: false, pattern: null };

  // POS estero (controllo PRIMA del POS normale: più specifico)
  const posEstero = trimmed.match(POS_ESTERO_PATTERN);
  if (posEstero && posEstero[1]) {
    const merchant = posEstero[1].replace(/\s+/g, " ").trim();
    if (merchant.length >= MIN_LENGTH) {
      return {
        clean: `POS estero — ${merchant}`,
        changed: true,
        pattern: "pos-estero",
      };
    }
  }

  // POS Italia
  const pos = trimmed.match(POS_PATTERN);
  if (pos && pos[1]) {
    const merchant = pos[1].replace(/\s+/g, " ").trim();
    if (merchant.length >= MIN_LENGTH) {
      return { clean: merchant, changed: true, pattern: "pos" };
    }
  }

  // ADUE / SDD
  const adue = trimmed.match(ADUE_PATTERN);
  if (adue && adue[2]) {
    const name = adue[2].replace(/\s+/g, " ").trim();
    if (name.length >= MIN_LENGTH) {
      const isCommission = !!adue[1];
      const clean = isCommission ? `Commissioni SDD — ${name}` : name;
      return {
        clean,
        changed: true,
        pattern: isCommission ? "adue-commission" : "adue",
      };
    }
  }

  // Bonifico in uscita
  const bonifico = trimmed.match(BONIFICO_USCITA_PATTERN);
  if (bonifico && bonifico[1]) {
    const rest = bonifico[1].replace(/\s+/g, " ").trim();
    if (rest.length >= MIN_LENGTH) {
      return {
        clean: `Bonifico → ${rest}`,
        changed: true,
        pattern: "bonifico-uscita",
      };
    }
  }

  // Accredito incoming (con guard per evitare match accidentali)
  if (ACCREDITO_GUARD.test(trimmed)) {
    const acc = trimmed.match(ACCREDITO_PATTERN);
    if (acc && acc[1]) {
      const mitt = acc[1].replace(/\s+/g, " ").trim();
      if (mitt.length >= MIN_LENGTH) {
        return { clean: `Da ${mitt}`, changed: true, pattern: "accredito" };
      }
    }
  }

  return { clean: raw, changed: false, pattern: null };
}
