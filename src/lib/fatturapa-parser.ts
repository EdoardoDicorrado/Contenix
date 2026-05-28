/**
 * Parser FatturaPA XML (standard fatture elettroniche italiane).
 * Usa DOMParser (browser-only). Niente dipendenze esterne.
 *
 * Schema riferimento: https://www.fatturapa.gov.it/it/norme-e-regole/
 * Versioni supportate: 1.2.x (la corrente per FatturaB2B/B2G).
 */

export type FatturaPAExtraction = {
  number: string;
  type: "purchase" | "sale"; // dedotto, può essere corretto dall'utente
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  totalAmount: string; // "1234.56"
  vatAmount: string | null;
  currency: string;
  status: "pending";
  // Cedente (chi emette)
  sender: { name: string; vat: string | null };
  // Cessionario (chi riceve)
  recipient: { name: string; vat: string | null };
  // Inferita: counterparte rispetto a "noi" (per ora = il cedente per default)
  counterpartyName: string;
  counterpartyVat: string | null;
  // Nuovi campi
  description: string | null; // sommario delle righe di dettaglio
  paymentIban: string | null;
  documentType: string | null; // TD01, TD04, ecc.
  paymentMethod: string | null; // MP05, MP08, ecc.
};

export type ParseResult =
  | { ok: true; data: FatturaPAExtraction }
  | { ok: false; error: string };

/**
 * Parser principale. Riceve testo XML, ritorna oggetto strutturato o errore.
 * @param ourVat - opzionale, P.IVA dell'azienda corrente per distinguere acquisto/vendita.
 */
export function parseFatturaPA(xmlText: string, ourVat?: string): ParseResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, "text/xml");
  } catch {
    return { ok: false, error: "XML non valido" };
  }

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    return { ok: false, error: "XML malformato: " + parserError.textContent?.slice(0, 200) };
  }

  // Verifica che sia un FatturaPA: cerca FatturaElettronica root o FatturaElettronicaHeader
  const root = doc.documentElement;
  const isFatturaPA =
    root.localName === "FatturaElettronica" ||
    doc.getElementsByTagName("FatturaElettronicaHeader").length > 0 ||
    doc.getElementsByTagName("FatturaElettronicaBody").length > 0;

  if (!isFatturaPA) {
    return {
      ok: false,
      error: "Non è un file FatturaPA standard (manca FatturaElettronicaHeader/Body)",
    };
  }

  const txt = (parent: Element | null | undefined, ...path: string[]): string => {
    if (!parent) return "";
    let cur: Element | null = parent;
    for (const tag of path) {
      cur = firstChildByLocalName(cur, tag);
      if (!cur) return "";
    }
    return cur.textContent?.trim() ?? "";
  };

  const header = firstChildByLocalName(root, "FatturaElettronicaHeader") ?? root;
  const body = firstChildByLocalName(root, "FatturaElettronicaBody") ?? root;

  // Cedente
  const cedente = firstChildByLocalName(header, "CedentePrestatore");
  const cedenteAnagrafica = firstChildByLocalName(
    firstChildByLocalName(cedente, "DatiAnagrafici"),
    "Anagrafica",
  );
  const cedenteName = composeName(cedenteAnagrafica);
  const cedenteVat = composeVat(firstChildByLocalName(cedente, "DatiAnagrafici"));

  // Cessionario
  const cessionario = firstChildByLocalName(header, "CessionarioCommittente");
  const cessAnagrafica = firstChildByLocalName(
    firstChildByLocalName(cessionario, "DatiAnagrafici"),
    "Anagrafica",
  );
  const cessName = composeName(cessAnagrafica);
  const cessVat = composeVat(firstChildByLocalName(cessionario, "DatiAnagrafici"));

  // Dati Generali Documento
  const datiGenerali = firstChildByLocalName(
    firstChildByLocalName(body, "DatiGenerali"),
    "DatiGeneraliDocumento",
  );
  const number = txt(datiGenerali, "Numero");
  const issueDate = txt(datiGenerali, "Data");
  const totalAmount = txt(datiGenerali, "ImportoTotaleDocumento");
  const currency = txt(datiGenerali, "Divisa") || "EUR";
  const documentType = txt(datiGenerali, "TipoDocumento") || null;
  const causale = txt(datiGenerali, "Causale");

  if (!number || !issueDate) {
    return { ok: false, error: "Manca numero o data fattura" };
  }

  // IVA totale: somma di DatiRiepilogo > Imposta
  const datiBeniServizi = firstChildByLocalName(body, "DatiBeniServizi");
  const riepiloghi = childrenByLocalName(datiBeniServizi, "DatiRiepilogo");
  let vatTotal = 0;
  let hasVat = false;
  for (const r of riepiloghi) {
    const imp = parseFloat(firstChildByLocalName(r, "Imposta")?.textContent ?? "");
    if (!isNaN(imp)) {
      vatTotal += imp;
      hasVat = true;
    }
  }

  // Scadenza dal primo DettaglioPagamento (se presente)
  const datiPagamento = firstChildByLocalName(body, "DatiPagamento");
  const dettaglioPag = firstChildByLocalName(datiPagamento, "DettaglioPagamento");
  const dueDate = txt(dettaglioPag, "DataScadenzaPagamento") || null;
  const paymentIbanRaw = txt(dettaglioPag, "IBAN") || null;
  const paymentIban = paymentIbanRaw ? paymentIbanRaw.replace(/\s+/g, "").toUpperCase() : null;
  const paymentMethod = txt(dettaglioPag, "ModalitaPagamento") || null;

  // Descrizione: concatena le DettaglioLinee saltando le righe ausiliarie con prezzo 0
  const dettaglioLinee = childrenByLocalName(datiBeniServizi, "DettaglioLinee");
  const descrizioni: string[] = [];
  for (const linea of dettaglioLinee) {
    const desc = txt(linea, "Descrizione");
    const prezzo = parseFloat(txt(linea, "PrezzoTotale") || "0");
    if (!desc) continue;
    // Salta righe ausiliarie (prezzo 0 e contiene termini tecnici tipici)
    if (prezzo === 0 && /informazioni|riga ausiliaria|asw|software house|tipo doc/i.test(desc)) {
      continue;
    }
    descrizioni.push(desc.trim());
  }
  let description: string | null = descrizioni.length > 0 ? descrizioni.join(" · ") : null;
  if (!description && causale) description = causale;
  if (description && description.length > 2000) description = description.slice(0, 1997) + "...";

  // Calcola totale (se manca ImportoTotaleDocumento, somma i prezzi totali)
  let total = parseFloat(totalAmount);
  if (isNaN(total)) {
    let acc = 0;
    for (const r of riepiloghi) {
      const ib = parseFloat(firstChildByLocalName(r, "ImponibileImporto")?.textContent ?? "");
      const im = parseFloat(firstChildByLocalName(r, "Imposta")?.textContent ?? "0");
      if (!isNaN(ib)) acc += ib + (isNaN(im) ? 0 : im);
    }
    total = acc;
  }
  if (isNaN(total) || total <= 0) {
    return { ok: false, error: "Importo totale non determinabile" };
  }

  // Tipo: confronta vat con ourVat
  const normalize = (s: string | null) => (s ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  let type: "purchase" | "sale";
  if (ourVat) {
    const our = normalize(ourVat);
    if (normalize(cedenteVat) === our) {
      type = "sale";
    } else if (normalize(cessVat) === our) {
      type = "purchase";
    } else {
      type = "purchase"; // default safe
    }
  } else {
    type = "purchase";
  }

  const counterparty = type === "sale"
    ? { name: cessName, vat: cessVat }
    : { name: cedenteName, vat: cedenteVat };

  return {
    ok: true,
    data: {
      number,
      type,
      issueDate: normalizeDate(issueDate),
      dueDate: dueDate ? normalizeDate(dueDate) : null,
      totalAmount: total.toFixed(2),
      vatAmount: hasVat ? vatTotal.toFixed(2) : null,
      currency,
      status: "pending",
      sender: { name: cedenteName, vat: cedenteVat },
      recipient: { name: cessName, vat: cessVat },
      counterpartyName: counterparty.name || "Sconosciuto",
      counterpartyVat: counterparty.vat,
      description,
      paymentIban,
      documentType,
      paymentMethod,
    },
  };
}

// --- helpers DOM (localName-aware per gestire namespace XML) ---

function firstChildByLocalName(parent: Element | null | undefined, tag: string): Element | null {
  if (!parent) return null;
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].localName === tag) return children[i];
  }
  return null;
}

function childrenByLocalName(parent: Element | null | undefined, tag: string): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  const c = parent.children;
  for (let i = 0; i < c.length; i++) {
    if (c[i].localName === tag) out.push(c[i]);
  }
  return out;
}

function composeName(anagrafica: Element | null): string {
  if (!anagrafica) return "";
  const denom = firstChildByLocalName(anagrafica, "Denominazione")?.textContent?.trim();
  if (denom) return denom;
  const nome = firstChildByLocalName(anagrafica, "Nome")?.textContent?.trim() ?? "";
  const cogn = firstChildByLocalName(anagrafica, "Cognome")?.textContent?.trim() ?? "";
  const full = [nome, cogn].filter(Boolean).join(" ");
  return full;
}

function composeVat(datiAnagrafici: Element | null): string | null {
  if (!datiAnagrafici) return null;
  const idFiscale = firstChildByLocalName(datiAnagrafici, "IdFiscaleIVA");
  if (idFiscale) {
    const paese = firstChildByLocalName(idFiscale, "IdPaese")?.textContent?.trim() ?? "";
    const codice = firstChildByLocalName(idFiscale, "IdCodice")?.textContent?.trim() ?? "";
    if (codice) return paese ? `${paese}${codice}` : codice;
  }
  const cf = firstChildByLocalName(datiAnagrafici, "CodiceFiscale")?.textContent?.trim();
  return cf || null;
}

function normalizeDate(d: string): string {
  // FatturaPA usa YYYY-MM-DD già. Ma per sicurezza riportiamo a quel formato.
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = d.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return d;
}
