/**
 * Parser CSV compatibile RFC 4180 con auto-detection del delimitatore.
 * Supporta: virgola, punto e virgola, tab. Gestisce quoting con "..." (e "" come escape).
 */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  delimiter: "," | ";" | "\t";
};

const DELIMITERS = [";", ",", "\t"] as const;

function detectDelimiter(sample: string): "," | ";" | "\t" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let best: "," | ";" | "\t" = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = (firstLine.match(new RegExp(d === "\t" ? "\\t" : d, "g")) ?? []).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string): ParsedCsv {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        cur.push(field);
        field = "";
        if (cur.length > 1 || cur[0] !== "") rows.push(cur);
        cur = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== "") rows.push(cur);
  }

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows, delimiter };
}

/**
 * Parse numero italiano: accetta "1.234,56" / "1234.56" / "1,234.56" / "-200,00" / "+200,00".
 * Ritorna number o NaN se non parsabile.
 */
export function parseItalianNumber(raw: string): number {
  if (!raw) return NaN;
  const s = raw.trim().replace(/[\s€$£]/g, "");
  if (!s) return NaN;

  // Determina separatore decimale: l'ultimo tra "," e "." è il decimale.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    // virgola decimale (formato IT)
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // punto decimale (formato EN)
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return n;
}

/**
 * Parse date in molti formati: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY.
 * Ritorna Date valido o null.
 */
export function parseItalianDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD o YYYY/MM/DD (ISO-like)
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY (IT/EU)
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}
