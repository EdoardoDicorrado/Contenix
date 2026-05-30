"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Layers,
  ListFilter,
  EyeOff,
  Eye,
  Wallet,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  analyzeStoricoAction,
  confirmStoricoImportAction,
  type AnalyzeStoricoResult,
} from "./actions";

type AnalyzeOk = Extract<AnalyzeStoricoResult, { ok: true }>;

type Step = "upload" | "categories" | "rules" | "confirm";

type CategoryDecision = {
  key: string;
  originalCanonical: string;
  canonical: string;
  type: "income" | "expense";
  color: string;
  rawNames: string[];
  totalRows: number;
  existingCategoryId: string | null;
  skip: boolean;
  recommendedByKnowledge: boolean;
};

type RuleDecision = {
  pattern: string;
  origin: "curated" | "statistical";
  source: "descriptionExt" | "description";
  coverageCount: number;
  reliability: number;
  movementType: "income" | "expense";
  targetCanonical: string;
  enabled: boolean;
  label?: string;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: "Banca",
  credit_card: "Carta",
  wallet: "Wallet",
  cash: "Contanti",
  other: "Altro",
};

const STEP_LABELS: Record<Step, string> = {
  upload: "Carica file",
  categories: "Conferma categorie",
  rules: "Conferma regole",
  confirm: "Importa",
};

const STEPS: Step[] = ["upload", "categories", "rules", "confirm"];

export function ImportStoricoClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analyzing, startAnalyzing] = useTransition();
  const [confirming, startConfirming] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<AnalyzeOk["accounts"]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeStoricoResult | null>(null);

  const [categoryDecisions, setCategoryDecisions] = useState<CategoryDecision[]>([]);
  const [ruleDecisions, setRuleDecisions] = useState<RuleDecision[]>([]);

  const [importResult, setImportResult] = useState<
    | { ok: true; insertedMovements: number; skippedMovements: number; createdCategories: number; createdRules: number; skippedRows: number }
    | { ok: false; error: string }
    | null
  >(null);

  // ===== STEP 1: UPLOAD =====
  function handleAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startAnalyzing(async () => {
      const res = await analyzeStoricoAction(fd);
      setAnalyzeResult(res);
      if (res.ok) {
        setAccounts(res.accounts);
        if (res.defaultAccountId) setAccountId(res.defaultAccountId);
        // Inizializza decisioni
        setCategoryDecisions(
          res.categoryProposals.map((p) => ({
            key: p.canonical,
            originalCanonical: p.canonical,
            canonical: p.canonical,
            type: p.type,
            color: p.color,
            rawNames: p.sourceNames,
            totalRows: p.totalRows,
            existingCategoryId: p.matchesExistingId,
            skip: p.skipByDefault,
            recommendedByKnowledge: p.recommendedByKnowledge,
          })),
        );
        setRuleDecisions(
          res.ruleProposals.map((r) => ({
            pattern: r.pattern,
            origin: r.origin,
            source: r.source,
            coverageCount: r.coverageCount,
            reliability: r.reliability,
            movementType: r.movementType,
            targetCanonical: r.canonicalCategoryName,
            // Curate: sempre attive. Statistical: attive solo se molto affidabili.
            enabled: r.origin === "curated" ? true : r.reliability >= 0.9,
            label: r.label,
          })),
        );
        setStep("categories");
      }
    });
  }

  // ===== STEP 4: CONFIRM =====
  function handleConfirmImport() {
    if (!file || !accountId) return;
    const fd = new FormData();
    fd.append("file", file);
    const metadata = {
      accountId,
      categories: categoryDecisions.map((d) => ({
        key: d.key,
        canonical: d.canonical.trim(),
        type: d.type,
        color: d.color,
        rawNames: d.rawNames,
        existingCategoryId: d.existingCategoryId,
        skip: d.skip,
      })),
      rules: ruleDecisions.map((r) => ({
        pattern: r.pattern,
        movementType: r.movementType,
        targetCanonical: r.targetCanonical.trim(),
        enabled: r.enabled,
      })),
    };
    fd.append("metadata", JSON.stringify(metadata));

    startConfirming(async () => {
      const res = await confirmStoricoImportAction(fd);
      setImportResult(res);
      if (res.ok) {
        // Refresh per aggiornare la dashboard
        router.refresh();
      }
    });
  }

  // Lista canonical disponibili per le regole (dalle decisioni non-skip)
  const availableCanonicals = useMemo(() => {
    const set = new Set<string>();
    for (const d of categoryDecisions) {
      if (!d.skip && d.canonical.trim()) set.add(d.canonical.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categoryDecisions]);

  // Conteggi per il riepilogo finale
  const summary = useMemo(() => {
    const activeCats = categoryDecisions.filter((d) => !d.skip);
    const newCats = activeCats.filter((d) => !d.existingCategoryId);
    const totalToImport = activeCats.reduce((s, d) => s + d.totalRows, 0);
    const skipped = categoryDecisions
      .filter((d) => d.skip)
      .reduce((s, d) => s + d.totalRows, 0);
    const activeRules = ruleDecisions.filter((r) => r.enabled);
    return {
      activeCatsCount: activeCats.length,
      newCatsCount: newCats.length,
      totalToImport,
      skipped,
      activeRulesCount: activeRules.length,
    };
  }, [categoryDecisions, ruleDecisions]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Importa storico categorizzato</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un Excel dove ogni riga ha già la categoria assegnata (es. esportazione anno precedente).
          Riconosceremo le categorie, proporremo merge per refusi, e creeremo regole di auto-categorizzazione
          per i pattern ricorrenti.
        </p>
      </div>

      <Stepper currentStep={step} />

      {step === "upload" && (
        <UploadStep
          file={file}
          setFile={setFile}
          fileInputRef={fileInputRef}
          analyzing={analyzing}
          analyzeResult={analyzeResult}
          onSubmit={handleAnalyze}
        />
      )}

      {step === "categories" && analyzeResult?.ok && (
        <CategoriesStep
          result={analyzeResult}
          decisions={categoryDecisions}
          setDecisions={setCategoryDecisions}
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          onBack={() => setStep("upload")}
          onNext={() => setStep("rules")}
        />
      )}

      {step === "rules" && analyzeResult?.ok && (
        <RulesStep
          ruleDecisions={ruleDecisions}
          setRuleDecisions={setRuleDecisions}
          availableCanonicals={availableCanonicals}
          onBack={() => setStep("categories")}
          onNext={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && analyzeResult?.ok && (
        <ConfirmStep
          summary={summary}
          accountId={accountId}
          accounts={accounts}
          importResult={importResult}
          confirming={confirming}
          onBack={() => setStep("rules")}
          onConfirm={handleConfirmImport}
        />
      )}
    </div>
  );
}

// ===================================================================
// STEPPER
// ===================================================================

function Stepper({ currentStep }: { currentStep: Step }) {
  const currentIdx = STEPS.indexOf(currentStep);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {STEPS.map((s, i) => {
        const isActive = s === currentStep;
        const isDone = i < currentIdx;
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium border ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : isDone
                    ? "bg-success text-white border-success"
                    : "bg-background border-border"
              }`}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={isActive ? "text-foreground font-medium" : ""}>
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <span className="text-border">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// ===================================================================
// STEP 1: UPLOAD
// ===================================================================

function UploadStep({
  file,
  setFile,
  fileInputRef,
  analyzing,
  analyzeResult,
  onSubmit,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzing: boolean;
  analyzeResult: AnalyzeStoricoResult | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6">
      <div className="flex flex-col gap-2">
        <Label>File Excel (.xlsx)</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {file ? "Cambia file" : "Scegli file"}
          </Button>
          {file && (
            <span className="text-sm text-muted-foreground truncate">{file.name}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Il file deve avere: Tipologia (col A), Data contabile (col B), Descrizione (col D),
          Accrediti (col E), Addebiti (col F), Descrizione estesa (col G). I dati partono dalla riga 3.
        </p>
      </div>

      {analyzeResult && !analyzeResult.ok && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{analyzeResult.error}</div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!file || analyzing} className="gap-2">
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {analyzing ? "Analisi in corso…" : "Analizza file"}
        </Button>
      </div>
    </form>
  );
}

// ===================================================================
// STEP 2: CATEGORIES
// ===================================================================

function CategoriesStep({
  result,
  decisions,
  setDecisions,
  accounts,
  accountId,
  setAccountId,
  onBack,
  onNext,
}: {
  result: AnalyzeOk;
  decisions: CategoryDecision[];
  setDecisions: React.Dispatch<React.SetStateAction<CategoryDecision[]>>;
  accounts: AnalyzeOk["accounts"];
  accountId: string;
  setAccountId: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function updateDecision(key: string, patch: Partial<CategoryDecision>) {
    setDecisions((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const mergeCount = decisions.reduce((s, d) => s + (d.rawNames.length - 1), 0);
  const skipCount = decisions.filter((d) => d.skip).length;
  const canProceed = accountId !== "" && decisions.some((d) => !d.skip);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Wallet className="h-4 w-4 text-blue-600" />
          Conto di destinazione
        </div>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Seleziona conto…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.isPrimary ? "★ " : ""}
              {a.name} ({ACCOUNT_TYPE_LABEL[a.type] ?? a.type})
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Tutti i movimenti verranno assegnati a questo conto.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers className="h-4 w-4 text-blue-600" />
            Categorie trovate
            <Badge tone="neutral" className="ml-1">
              {decisions.length}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            {mergeCount > 0 && (
              <span>
                <span className="text-success font-medium">{mergeCount}</span> fusioni
                proposte
              </span>
            )}
            {skipCount > 0 && (
              <span>
                <span className="text-amber-700 font-medium">{skipCount}</span> escluse
              </span>
            )}
            <span>
              <span className="font-medium">{result.totalRows}</span> righe totali
            </span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {decisions.map((d) => {
            const isExp = expanded.has(d.key);
            const hasMerge = d.rawNames.length > 1;
            return (
              <div key={d.key} className={`p-4 ${d.skip ? "bg-muted/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={d.canonical}
                        onChange={(e) => updateDecision(d.key, { canonical: e.target.value })}
                        disabled={d.skip}
                        className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-blue-500 focus:outline-none px-1 -mx-1 disabled:opacity-60 disabled:line-through"
                      />
                      <Badge tone={d.type === "income" ? "success" : "neutral"} className="text-[10px]">
                        {d.type === "income" ? "↑ Entrata" : "↓ Uscita"}
                      </Badge>
                      {d.existingCategoryId && (
                        <Badge tone="primary" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Esistente
                        </Badge>
                      )}
                      {d.recommendedByKnowledge && (
                        <Badge tone="primary" className="text-[10px] gap-1">
                          <Sparkles className="h-3 w-3" /> Consigliata
                        </Badge>
                      )}
                      {hasMerge && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(d.key)}
                          className="text-[11px] text-blue-700 hover:underline"
                        >
                          {isExp ? "Nascondi" : "Mostra"} {d.rawNames.length} alias
                        </button>
                      )}
                    </div>
                    {isExp && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                        Fonderemo: {d.rawNames.join(" • ")}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {d.totalRows} {d.totalRows === 1 ? "movimento" : "movimenti"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={d.type}
                      onChange={(e) =>
                        updateDecision(d.key, { type: e.target.value as "income" | "expense" })
                      }
                      disabled={d.skip}
                      className="h-8 text-xs w-28"
                    >
                      <option value="expense">Uscita</option>
                      <option value="income">Entrata</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => updateDecision(d.key, { skip: !d.skip })}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title={d.skip ? "Includi" : "Escludi dall'import"}
                    >
                      {d.skip ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Indietro
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          Avanti <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ===================================================================
// STEP 3: RULES
// ===================================================================

function RulesStep({
  ruleDecisions,
  setRuleDecisions,
  availableCanonicals,
  onBack,
  onNext,
}: {
  ruleDecisions: RuleDecision[];
  setRuleDecisions: React.Dispatch<React.SetStateAction<RuleDecision[]>>;
  availableCanonicals: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  function updateRule(idx: number, patch: Partial<RuleDecision>) {
    setRuleDecisions((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  const enabledCount = ruleDecisions.filter((r) => r.enabled).length;
  const totalCoverage = ruleDecisions
    .filter((r) => r.enabled)
    .reduce((s, r) => s + r.coverageCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background p-4 text-sm">
        <div className="flex items-center gap-2 mb-2 font-medium">
          <ListFilter className="h-4 w-4 text-blue-600" />
          Regole di auto-categorizzazione proposte
        </div>
        <p className="text-xs text-muted-foreground">
          Ogni regola dice: <span className="font-medium">se la descrizione contiene questo testo</span>,
          assegna automaticamente questa categoria. Le regole resteranno attive anche per i
          movimenti futuri (es. import successivi). Puoi cambiare la categoria di destinazione
          per ogni regola — utile se vuoi affinare la classificazione (es. spostare le righe
          &quot;deliveroo&quot; dalle Trasferte ai Ristoranti).
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {ruleDecisions.length} pattern affidabili trovati
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{enabledCount}</span> attive,
            copriranno <span className="font-medium text-foreground">{totalCoverage}</span>{" "}
            movimenti
          </span>
        </div>

        {ruleDecisions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nessun pattern abbastanza affidabile da diventare regola automatica.
            I movimenti verranno comunque importati con la categoria originale del file.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {ruleDecisions.map((r, i) => (
              <div
                key={`${r.pattern}-${i}`}
                className={`p-3 flex items-center gap-3 ${r.enabled ? "" : "bg-muted/40 opacity-70"}`}
              >
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateRule(i, { enabled: e.target.checked })}
                  className="h-4 w-4"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                      {r.pattern}
                    </code>
                    {r.label && (
                      <span className="text-xs text-muted-foreground">
                        ({r.label})
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {r.coverageCount} movimenti
                    </span>
                    {r.origin === "curated" ? (
                      <Badge tone="primary" className="text-[10px] gap-1">
                        <Sparkles className="h-3 w-3" /> Consigliata
                      </Badge>
                    ) : (
                      <>
                        <ReliabilityBadge value={r.reliability} />
                        <Badge tone="neutral" className="text-[10px]">
                          {r.source === "descriptionExt" ? "da vendor" : "da descrizione"}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">→</span>
                  <CanonicalSelect
                    value={r.targetCanonical}
                    onChange={(v) => updateRule(i, { targetCanonical: v })}
                    options={availableCanonicals}
                    disabled={!r.enabled}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Indietro
        </Button>
        <Button onClick={onNext} className="gap-2">
          Avanti <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReliabilityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 95
      ? "bg-success/15 text-success border-success/30"
      : pct >= 80
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
      {pct}% affidabile
    </span>
  );
}

function CanonicalSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  // Se l'utente sceglie "__custom__" passiamo a input testuale
  const [custom, setCustom] = useState(false);
  const sortedOptions = useMemo(() => {
    const inList = options.includes(value);
    return inList ? options : [value, ...options];
  }, [options, value]);

  if (custom) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setCustom(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setCustom(false);
        }}
        disabled={disabled}
        className="h-8 text-xs border border-input rounded-md px-2 bg-background w-44"
        placeholder="Nome categoria…"
      />
    );
  }

  return (
    <Select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom(true);
        } else {
          onChange(e.target.value);
        }
      }}
      disabled={disabled}
      className="h-8 text-xs w-44"
    >
      {sortedOptions.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__custom__">+ Nuova categoria…</option>
    </Select>
  );
}

// ===================================================================
// STEP 4: CONFIRM
// ===================================================================

function ConfirmStep({
  summary,
  accountId,
  accounts,
  importResult,
  confirming,
  onBack,
  onConfirm,
}: {
  summary: {
    activeCatsCount: number;
    newCatsCount: number;
    totalToImport: number;
    skipped: number;
    activeRulesCount: number;
  };
  accountId: string;
  accounts: AnalyzeOk["accounts"];
  importResult:
    | { ok: true; insertedMovements: number; skippedMovements: number; createdCategories: number; createdRules: number; skippedRows: number }
    | { ok: false; error: string }
    | null;
  confirming: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const account = accounts.find((a) => a.id === accountId);

  if (importResult?.ok) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-success font-medium">
          <CheckCircle2 className="h-5 w-5" />
          Import completato
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-success">
          <StatRow label="Movimenti importati" value={importResult.insertedMovements} />
          <StatRow label="Duplicati saltati" value={importResult.skippedMovements} />
          <StatRow label="Categorie create" value={importResult.createdCategories} />
          <StatRow label="Regole create" value={importResult.createdRules} />
          <StatRow label="Righe escluse" value={importResult.skippedRows} />
        </div>
        <div className="flex gap-2 mt-2">
          <Link
            href="/movimenti"
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors"
          >
            Vai ai movimenti
          </Link>
          <Link
            href="/categorie"
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-muted text-foreground border border-border hover:bg-border/60 transition-colors"
          >
            Vedi categorie
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background p-6">
        <div className="text-sm font-medium mb-4">Riepilogo prima dell&apos;import</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <SummaryRow
            label="Conto destinazione"
            value={
              account
                ? `${account.isPrimary ? "★ " : ""}${account.name}`
                : "—"
            }
            icon={<Wallet className="h-4 w-4" />}
          />
          <SummaryRow
            label="Categorie attive"
            value={`${summary.activeCatsCount} (${summary.newCatsCount} nuove)`}
            icon={<Layers className="h-4 w-4" />}
          />
          <SummaryRow
            label="Regole automatiche"
            value={String(summary.activeRulesCount)}
            icon={<ListFilter className="h-4 w-4" />}
          />
          <SummaryRow
            label="Movimenti da importare"
            value={String(summary.totalToImport)}
            icon={<Star className="h-4 w-4" />}
          />
          {summary.skipped > 0 && (
            <SummaryRow
              label="Righe escluse"
              value={String(summary.skipped)}
              icon={<EyeOff className="h-4 w-4" />}
            />
          )}
        </div>
      </div>

      {importResult && !importResult.ok && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{importResult.error}</div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} disabled={confirming} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Indietro
        </Button>
        <Button onClick={onConfirm} disabled={confirming || !accountId} className="gap-2">
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {confirming ? "Import in corso…" : "Conferma e importa"}
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
