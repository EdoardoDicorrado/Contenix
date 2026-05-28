import { parseCsv, type ParsedCsv } from "./csv";

export type SheetInfo = { name: string; index: number };
export type FileExtraction =
  | { kind: "csv"; data: ParsedCsv }
  | {
      kind: "xlsx";
      sheets: SheetInfo[];
      readSheet: (sheetName: string) => Promise<{ headers: string[]; rows: string[][] }>;
    };

function getKind(file: File): "csv" | "xlsx" {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) return "csv";
  if (file.type.includes("spreadsheet") || file.type.includes("excel")) return "xlsx";
  return "csv";
}

export async function extractFile(file: File): Promise<FileExtraction> {
  const kind = getKind(file);

  if (kind === "csv") {
    const text = await file.text();
    return { kind: "csv", data: parseCsv(text) };
  }

  const mod = await import("read-excel-file/browser");
  const sheets = await mod.default(file);

  return {
    kind: "xlsx",
    sheets: sheets.map((s, i) => ({ name: s.sheet, index: i })),
    readSheet: async (sheetName: string) => {
      const found = sheets.find((s) => s.sheet === sheetName) ?? sheets[0];
      const data = found?.data ?? [];
      const rows = data.map((row) =>
        row.map((c) =>
          c == null ? "" : c instanceof Date ? formatDateForCsv(c) : String(c),
        ),
      );
      const headers = (rows.shift() ?? []).map((h) => h.trim());
      return { headers, rows };
    },
  };
}

function formatDateForCsv(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
