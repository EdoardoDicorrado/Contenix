"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { extractFile, type SheetInfo } from "@/lib/file-reader";
import {
  autoDetectMapping,
  transformAll,
  COLUMN_ROLE_LABELS,
  type ColumnMapping,
  type ColumnRole,
} from "@/lib/import-mapping";
import { formatCurrency, formatDate } from "@/lib/utils";
import { importMovementsAction } from "./actions";

type Category = { id: string; name: string; type: "income" | "expense" };

type XlsxState = {
  sheets: SheetInfo[];
  readSheet: (name: string) => Promise<{ headers: string[]; rows: string[][] }>;
  currentSheet: string;
};

const ROLE_OPTIONS: ColumnRole[] = [
  "ignore",
  "date",
  "description",
  "amount",
  "debit",
  "credit",
];

type AccountSlim = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "wallet" | "cash" | "other";
  isPrimary: boolean;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: "Banca",
  credit_card: "Carta",
  wallet: "Wallet",
  cash: "Contanti",
  other: "Altro",
};

export function ImportClient({
  categories,
  accounts,
  defaultAccountId,
}: {
  categories: Category[];
  accounts: AccountSlim[];
  defaultAccountId: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"csv" | "xlsx" | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [delimiter, setDelimiter] = useState<string>("");
  const [xlsx, setXlsx] = useState<XlsxState | null>(null);
  const [targetAccountId, setTargetAccountId] = useState<string>(defaultAccountId ?? "");
  const [defaultIncomeCat, setDefaultIncomeCat] = useState("");
  const [defaultExpenseCat, setDefaultExpenseCat] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const transformed = useMemo(() => {
    if (rows.length === 0 || mapping.length === 0) return null;
    return transformAll(rows, mapping);
  }, [rows, mapping]);

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    setFileName(file.name);
    setXlsx(null);

    try {
      const extracted = await extractFile(file);

      if (extracted.kind === "csv") {
        setFileKind("csv");
        const parsed = extracted.data;
        if (parsed.headers.length === 0) {
          setParseError("Il file non contiene intestazioni leggibili.");
          return;
        }
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setMapping(autoDetectMapping(parsed.headers));
        setDelimiter(parsed.delimiter === "\t" ? "TAB" : parsed.delimiter);
      } else {
        setFileKind("xlsx");
        const firstSheet = extracted.sheets[0]?.name ?? "";
        setXlsx({
          sheets: extracted.sheets,
          readSheet: extracted.readSheet,
          currentSheet: firstSheet,
        });
        await loadXlsxSheet(extracted.readSheet, firstSheet);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Errore lettura file");
    }
  }

  async function loadXlsxSheet(
    readSheet: (name: string) => Promise<{ headers: string[]; rows: string[][] }>,
    name: string,
  ) {
    try {
      const { headers: h, rows: r } = await readSheet(name);
      if (h.length === 0) {
        setParseError("Il foglio selezionato non contiene intestazioni.");
        return;
      }
      setHeaders(h);
      setRows(r);
      setMapping(autoDetectMapping(h));
      setDelimiter("XLSX");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Errore lettura foglio Excel");
    }
  }

  async function handleSheetChange(name: string) {
    if (!xlsx) return;
    setXlsx({ ...xlsx, currentSheet: name });
    await loadXlsxSheet(xlsx.readSheet, name);
  }

  function reset() {
    setFileName(null);
    setFileKind(null);
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setDelimiter("");
    setXlsx(null);
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleConfirm() {
    if (!transformed || transformed.valid.length === 0) return;
    setSubmitError(null);

    const payload = {
      rows: transformed.valid.map((r) => ({
        date: r.date.toISOString(),
        amount: r.amount,
        type: r.type,
        description: r.description,
      })),
      defaultIncomeCategoryId: defaultIncomeCat || null,
      defaultExpenseCategoryId: defaultExpenseCat || null,
      accountId: targetAccountId || null,
    };

    startTransition(async () => {
      const res = await importMovementsAction(payload);
      if (res.ok) {
        setResult({ inserted: res.inserted });
      } else {
        setSubmitError(res.error);
      }
    });
  }

  if (result) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-muted p-8 flex flex-col items-center text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="text-base font-semibold mt-3">Import completato</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {result.inserted} movimenti aggiunti correttamente
        </p>
        <div className="flex items-center gap-2 mt-5">
          <Button onClick={() => router.push("/movimenti")}>Vai ai movimenti</Button>
          <Button variant="ghost" onClick={reset}>
            Importa un altro file
          </Button>
        </div>
      </div>
    );
  }

  const selectedAccount = accounts.find((a) => a.id === targetAccountId);

  return (
    <div className="flex flex-col gap-6">
      {/* Selettore conto destinazione */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Label>Conto destinazione</Label>
          <div className="text-xs text-muted-foreground">
            Tutti i movimenti del file verranno assegnati a:{" "}
            <strong>{selectedAccount?.name ?? "— Nessun conto —"}</strong>
            {selectedAccount?.isPrimary && " ★"}
          </div>
        </div>
        <Select
          value={targetAccountId}
          onChange={(e) => setTargetAccountId(e.target.value)}
          className="w-full sm:w-64"
        >
          <option value="">— Seleziona conto —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.isPrimary ? "★" : ""} ({ACCOUNT_TYPE_LABEL[a.type]})
            </option>
          ))}
        </Select>
      </div>

      {!fileName ? (
        <DropZone fileInputRef={fileInputRef} onFile={handleFile} />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{fileName}</div>
              <div className="text-xs text-muted-foreground">
                {rows.length} righe ·{" "}
                {fileKind === "xlsx" ? (
                  <>Excel · foglio <code className="font-mono">{xlsx?.currentSheet}</code></>
                ) : (
                  <>CSV · separatore <code className="font-mono">{delimiter || "?"}</code></>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {fileKind === "xlsx" && xlsx && xlsx.sheets.length > 1 && (
              <Select
                value={xlsx.currentSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="w-44"
                aria-label="Seleziona foglio"
              >
                {xlsx.sheets.map((s) => (
                  <option key={s.index} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Annulla">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {parseError && (
        <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <span className="text-sm text-danger">{parseError}</span>
        </div>
      )}

      {headers.length > 0 && (
        <>
          <section className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Mappa le colonne</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Le banche italiane di solito hanno <strong>Dare</strong> (uscite) e{" "}
                <strong>Avere</strong> (entrate) separati. Se invece c&apos;è un solo
                importo con segno + / −, scegli <strong>Importo (con segno)</strong>.
              </p>
            </div>
            <div className="divide-y divide-border">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      col {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{h || <em className="text-muted-foreground">(senza nome)</em>}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      es. &quot;{rows[0]?.[i] ?? ""}&quot;
                    </span>
                  </div>
                  <Select
                    value={mapping[i] ?? "ignore"}
                    onChange={(e) => {
                      const next = [...mapping];
                      next[i] = e.target.value as ColumnRole;
                      setMapping(next);
                    }}
                    className="w-44 shrink-0"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {COLUMN_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Categoria di default (opzionale)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                I movimenti importati verranno assegnati a queste categorie. Potrai modificarle dopo.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 py-4">
              <div>
                <Label>Categoria per le entrate</Label>
                <Select
                  value={defaultIncomeCat}
                  onChange={(e) => setDefaultIncomeCat(e.target.value)}
                >
                  <option value="">— Nessuna —</option>
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Categoria per le uscite</Label>
                <Select
                  value={defaultExpenseCat}
                  onChange={(e) => setDefaultExpenseCat(e.target.value)}
                >
                  <option value="">— Nessuna —</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </section>

          {transformed && (
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold">Anteprima</h3>
                <div className="flex items-center gap-2">
                  <Badge tone="success">{transformed.valid.length} validi</Badge>
                  {transformed.errors.length > 0 && (
                    <Badge tone="danger">{transformed.errors.length} con errore</Badge>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Data</th>
                    <th className="text-left font-medium px-4 py-2">Descrizione</th>
                    <th className="text-right font-medium px-4 py-2">Importo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transformed.valid.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground align-top whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-4 py-2 align-top whitespace-pre-wrap break-words">
                        {r.description}
                      </td>
                      <td
                        className={
                          "px-4 py-2 text-right tabular-nums font-medium align-top whitespace-nowrap " +
                          (r.type === "income" ? "text-success" : "text-danger")
                        }
                      >
                        {r.type === "income" ? "+" : "−"}
                        {formatCurrency(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {transformed.valid.length > 10 && (
                <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border bg-muted/30">
                  …e altre {transformed.valid.length - 10} righe simili
                </div>
              )}

              {transformed.errors.length > 0 && (
                <details className="border-t border-border">
                  <summary className="px-4 py-2.5 cursor-pointer text-xs text-danger hover:bg-danger-muted">
                    Vedi {transformed.errors.length} righe scartate
                  </summary>
                  <ul className="px-4 py-3 text-xs text-muted-foreground space-y-1 max-h-48 overflow-auto">
                    {transformed.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        <span className="text-danger">{e.error}</span> ·{" "}
                        <span className="font-mono">{e.original.join(" | ")}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          {submitError && (
            <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
              <span className="text-sm text-danger">{submitError}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleConfirm}
              disabled={pending || !transformed || transformed.valid.length === 0}
            >
              {pending
                ? "Import in corso…"
                : `Importa ${transformed?.valid.length ?? 0} movimenti`}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={pending}>
              Annulla
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DropZone({
  fileInputRef,
  onFile,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  const [isDrag, setIsDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDrag(true);
      }}
      onDragLeave={() => setIsDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => fileInputRef.current?.click()}
      className={
        "rounded-lg border-2 border-dashed px-6 py-12 flex flex-col items-center justify-center text-center cursor-pointer transition-colors " +
        (isDrag
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40 bg-muted/20")
      }
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium mt-3">
        Trascina qui il file o clicca per selezionarlo
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Formati supportati: CSV (UTF-8) o Excel (.xlsx, .xls)
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
