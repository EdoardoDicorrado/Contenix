import "server-only";
import { parseHTML } from "linkedom";
import { parseFatturaPA, type ParseResult } from "./fatturapa-parser";

let domParserInstalled = false;

function ensureDOMParser() {
  if (domParserInstalled) return;
  const { DOMParser } = parseHTML("<!doctype html><html><body></body></html>");
  (globalThis as { DOMParser?: typeof DOMParser }).DOMParser = DOMParser;
  domParserInstalled = true;
}

export function parseFatturaPAServer(xmlText: string, ourVat?: string): ParseResult {
  ensureDOMParser();
  return parseFatturaPA(xmlText, ourVat);
}
