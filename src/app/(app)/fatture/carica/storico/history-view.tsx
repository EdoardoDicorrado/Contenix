"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  History,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import {
  clearUploadHistory,
  getUploadHistory,
  type UploadRunEntry,
} from "@/lib/upload-history";
import type { UploadFileResult } from "../actions";

export function UploadHistoryView() {
  const [entries, setEntries] = useState<UploadRunEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEntries(getUploadHistory());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleClear() {
    if (!confirm("Cancellare tutto lo storico upload?")) return;
    clearUploadHistory();
    setEntries([]);
  }

  if (!hydrated) {
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        Caricamento storico…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-12 text-center flex flex-col items-center gap-3">
        <History className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Nessun upload registrato</p>
          <p className="text-xs text-muted-foreground mt-1">
            Carica delle fatture da{" "}
            <Link
              href="/fatture/carica"
              className="text-foreground hover:underline"
            >
              Carica fatture
            </Link>{" "}
            per vederle qui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Trash2 className="h-3 w-3" /> Pulisci storico
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li key={`${e.ranAt}-${i}`}>
            <RunCard entry={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunCard({ entry }: { entry: UploadRunEntry }) {
  const [open, setOpen] = useState(false);
  const date = new Date(entry.ranAt);
  const r = entry.result;

  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="text-muted-foreground mt-0.5 shrink-0">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              Upload del{" "}
              {date.toLocaleString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatRelative(date)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <Stat label="Letti" value={r.totalCreated} tone="success" />
            {r.totalStub > 0 && <Stat label="PDF stub" value={r.totalStub} />}
            {r.totalDuplicates > 0 && (
              <Stat label="Duplicati" value={r.totalDuplicates} />
            )}
            {r.totalSkipped > 0 && (
              <Stat label="Metadati saltati" value={r.totalSkipped} />
            )}
            {r.totalErrors > 0 && (
              <Stat label="Errori" value={r.totalErrors} tone="danger" />
            )}
          </div>
        </div>
      </button>

      {open && <FilesList files={r.files} />}
    </div>
  );
}

function FilesList({ files }: { files: UploadFileResult[] }) {
  const [filter, setFilter] = useState<UploadFileResult["status"] | "all">("all");

  const filtered = filter === "all" ? files : files.filter((f) => f.status === filter);

  const counts = {
    all: files.length,
    created: files.filter((f) => f.status === "created").length,
    stub: files.filter((f) => f.status === "stub").length,
    duplicate: files.filter((f) => f.status === "duplicate").length,
    skipped: files.filter((f) => f.status === "skipped").length,
    error: files.filter((f) => f.status === "error").length,
  };

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-1.5 px-4 py-2 flex-wrap text-xs">
        <FilterPill label="Tutti" active={filter === "all"} count={counts.all} onClick={() => setFilter("all")} />
        {counts.created > 0 && (
          <FilterPill label="Letti" active={filter === "created"} count={counts.created} onClick={() => setFilter("created")} />
        )}
        {counts.stub > 0 && (
          <FilterPill label="PDF stub" active={filter === "stub"} count={counts.stub} onClick={() => setFilter("stub")} />
        )}
        {counts.duplicate > 0 && (
          <FilterPill label="Duplicati" active={filter === "duplicate"} count={counts.duplicate} onClick={() => setFilter("duplicate")} />
        )}
        {counts.skipped > 0 && (
          <FilterPill label="Metadati" active={filter === "skipped"} count={counts.skipped} onClick={() => setFilter("skipped")} />
        )}
        {counts.error > 0 && (
          <FilterPill label="Errori" active={filter === "error"} count={counts.error} onClick={() => setFilter("error")} />
        )}
      </div>

      <ul className="divide-y divide-border max-h-96 overflow-y-auto">
        {filtered.map((f, i) => (
          <FileRow key={`${f.fileName}-${i}`} file={f} />
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-xs text-muted-foreground text-center">
            Nessun file in questa categoria.
          </li>
        )}
      </ul>
    </div>
  );
}

function FileRow({ file }: { file: UploadFileResult }) {
  return (
    <li className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
      <div className="min-w-0 flex items-center gap-2">
        <StatusIcon status={file.status} />
        <div className="min-w-0">
          <div className="font-mono truncate text-foreground">{file.fileName}</div>
          {file.invoiceNumber && (
            <div className="text-[10.5px] text-muted-foreground">
              {file.counterparty} · n. {file.invoiceNumber}
            </div>
          )}
          {file.error && (
            <div className="text-[10.5px] text-danger">{file.error}</div>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <StatusBadge status={file.status} />
        {file.invoiceId && (
          <Link
            href={`/fatture/${file.invoiceId}`}
            className="text-[10.5px] text-foreground hover:underline"
          >
            Apri
          </Link>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: UploadFileResult["status"] }) {
  const map: Record<UploadFileResult["status"], React.ReactNode> = {
    created: <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />,
    stub: <Sparkles className="h-3.5 w-3.5 text-foreground shrink-0" />,
    duplicate: <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
    skipped: <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-danger shrink-0" />,
  };
  return map[status];
}

function StatusBadge({ status }: { status: UploadFileResult["status"] }) {
  if (status === "created") return <Badge tone="success">Letto XML</Badge>;
  if (status === "stub") return <Badge tone="primary">Da estrarre</Badge>;
  if (status === "duplicate") return <Badge tone="neutral">Duplicato</Badge>;
  if (status === "skipped") return <Badge tone="neutral">Metadato SDI</Badge>;
  return <Badge tone="danger">Errore</Badge>;
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-foreground";
  return (
    <span>
      {label}{" "}
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </span>
  );
}
