"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  FileCode,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { uploadFilesAction, type UploadResult } from "./actions";
import { appendUploadRun } from "@/lib/upload-history";

const LS_OUR_VAT = "wpaper.ourVat";
const DEFAULT_OUR_VAT = "IT01827680339"; // WPaper

export function UploadClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  // SSR-safe: parte sempre con il default WPaper. Se l'utente ha salvato un
  // valore diverso (es. test con altra P.IVA), lo ripristiniamo lato client.
  const [ourVat, setOurVat] = useState<string>(DEFAULT_OUR_VAT);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Contatore secondi trascorsi durante l'upload: feedback "vivo" all'utente
  // quando un batch di centinaia di fatture richiede minuti.
  const [elapsed, setElapsed] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_OUR_VAT);
      if (saved && saved !== DEFAULT_OUR_VAT) setOurVat(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const valid = arr.filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".xml") || n.endsWith(".pdf") || n.endsWith(".zip");
    });
    setPickedFiles((prev) => [...prev, ...valid]);
  }

  function removeAt(i: number) {
    setPickedFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function reset() {
    setPickedFiles([]);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function saveOurVat(v: string) {
    setOurVat(v);
    if (typeof window !== "undefined") localStorage.setItem(LS_OUR_VAT, v);
  }

  function handleSubmit() {
    if (pickedFiles.length === 0) return;
    setError(null);

    // P.IVA WPaper sempre presente. Se l'utente l'ha svuotata per errore,
    // ripristiniamo silenziosamente il default.
    const effectiveVat = ourVat.trim() || DEFAULT_OUR_VAT;
    if (effectiveVat !== ourVat) setOurVat(effectiveVat);

    const fd = new FormData();
    fd.append("ourVat", effectiveVat);
    for (const f of pickedFiles) fd.append("files", f, f.name);

    startTransition(async () => {
      try {
        const res = await uploadFilesAction(fd);
        setResult(res);
        // Storico locale per "cosa è entrato e cosa no" tra una sessione e l'altra
        if (res.ok) appendUploadRun(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore upload");
      }
    });
  }

  if (result) {
    return <ResultPanel result={result} onReset={reset} onGoFatture={() => router.push("/fatture")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <Label>P.IVA WPaper (per distinguere acquisti / vendite)</Label>
        <div className="flex items-center gap-2">
          <Input
            value={ourVat}
            onChange={(e) => saveOurVat(e.target.value.toUpperCase())}
            placeholder={DEFAULT_OUR_VAT}
            maxLength={20}
            required
            className="font-mono"
          />
          {ourVat === DEFAULT_OUR_VAT ? (
            <Badge tone="success">WPaper</Badge>
          ) : ourVat ? (
            <Badge tone="primary">Custom</Badge>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Usata solo per XML FatturaPA. Salvata nel browser.
        </p>
      </div>

      <DropZone fileInputRef={fileInputRef} onFiles={addFiles} />

      {pickedFiles.length > 0 && (
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">{pickedFiles.length} file pronti</h3>
            <Button variant="ghost" size="sm" onClick={reset}>
              Svuota
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {pickedFiles.map((f, i) => (
              <FileRow key={i} file={f} onRemove={() => removeAt(i)} />
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {pickedFiles.length > 0 && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Upload in corso… {elapsed > 0 ? `(${formatElapsed(elapsed)})` : ""}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Carica {pickedFiles.length} file
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={reset} disabled={pending}>
            Annulla
          </Button>
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  const n = file.name.toLowerCase();
  const Icon = n.endsWith(".xml") ? FileCode : n.endsWith(".zip") ? FileArchive : FileText;
  const kindLabel = n.endsWith(".xml")
    ? "XML FatturaPA"
    : n.endsWith(".zip")
      ? "Archivio ZIP"
      : "PDF (stub, da completare)";
  const sizeLabel = formatBytes(file.size);
  return (
    <li className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-sm truncate">{file.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {kindLabel} · {sizeLabel}
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Rimuovi">
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

function DropZone({
  fileInputRef,
  onFiles,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (f: FileList | File[]) => void;
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
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
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
      <p className="text-sm font-medium mt-3">Trascina XML, PDF o ZIP (anche multipli)</p>
      <p className="text-xs text-muted-foreground mt-1">
        XML FatturaPA → lettura automatica. PDF → archiviato, dati da completare. ZIP → estratto e processato file per file.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.pdf,.zip,text/xml,application/xml,application/pdf,application/zip"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
        }}
      />
    </div>
  );
}

function ResultPanel({
  result,
  onReset,
  onGoFatture,
}: {
  result: UploadResult;
  onReset: () => void;
  onGoFatture: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-success/30 bg-success-muted p-6 flex flex-col items-center text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="text-base font-semibold mt-3">Upload completato</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {result.totalCreated} XML letti · {result.totalStub} PDF archiviati ·{" "}
          {result.totalDuplicates} duplicati · {result.totalSkipped} metadati SDI saltati ·{" "}
          {result.totalErrors} errori
        </p>
        <div className="flex items-center gap-2 mt-5">
          <Button onClick={onGoFatture}>Vai alle fatture</Button>
          <Button variant="ghost" onClick={onReset}>
            Carica altri file
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dettaglio file
          </span>
        </div>
        <ul className="divide-y divide-border">
          {result.files.map((f, i) => (
            <li key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-mono truncate">{f.fileName}</span>
                </div>
                {f.invoiceNumber && (
                  <div className="text-xs text-muted-foreground">
                    {f.counterparty} · n. {f.invoiceNumber}
                    {f.totalAmount && ` · ${formatCurrency(parseFloat(f.totalAmount))}`}
                  </div>
                )}
                {f.error && <div className="text-xs text-danger">{f.error}</div>}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <StatusBadge status={f.status} />
                {f.invoiceId && (
                  <Link
                    href={`/fatture/${f.invoiceId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Apri
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "created" | "stub" | "duplicate" | "error" | "skipped" }) {
  if (status === "created") return <Badge tone="success">Letto XML</Badge>;
  if (status === "stub")
    return (
      <Badge tone="primary">
        <Sparkles className="h-3 w-3 inline mr-0.5" /> Da estrarre
      </Badge>
    );
  if (status === "duplicate") return <Badge tone="neutral">Duplicato</Badge>;
  if (status === "skipped") return <Badge tone="neutral">Metadato SDI</Badge>;
  return <Badge tone="danger">Errore</Badge>;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
