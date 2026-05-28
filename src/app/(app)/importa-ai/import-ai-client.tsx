"use client";

import { useRef, useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Wallet,
  Star,
  Layers,
  ListFilter,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CategoryCombo, type CategoryOption } from "@/components/ui/category-combo";
import { formatCurrency, formatDate } from "@/lib/utils";
import { groupMovements, type MovementGroup } from "@/lib/movement-grouping";
import {
  analyzeExcelAction,
  confirmExcelImportAction,
  type AnalyzeResult,
} from "./actions";

type AnalyzeOk = Extract<AnalyzeResult, { ok: true }>;
type ValidRow = AnalyzeOk["valid"][number];

type AccountOption = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "wallet" | "cash" | "other";
  color: string | null;
  isPrimary: boolean;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: "Banca",
  credit_card: "Carta",
  wallet: "Wallet",
  cash: "Contanti",
  other: "Altro",
};

type WizardStep = "summary" | "bulk" | "review" | "confirm";

export function ImportAiClient({
  categories: initialCategories,
  accounts,
  defaultAccountId,
}: {
  categories: CategoryOption[];
  accounts: AccountOption[];
  defaultAccountId: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analyzing, startAnalyzing] = useTransition();
  const [confirming, startConfirming] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [step, setStep] = useState<WizardStep>("summary");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [targetAccountId, setTargetAccountId] = useState<string>(defaultAccountId ?? "");
  const [defaultIncomeCat, setDefaultIncomeCat] = useState("");
  const [defaultExpenseCat, setDefaultExpenseCat] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories);

  // Override per riga: sourceRowIndex → categoryId (null = nessuna categoria)
  const [overrides, setOverrides] = useState<Map<number, string | null>>(new Map());

  const [importResult, setImportResult] = useState<{ inserted: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // useMemo deve essere chiamato sempre nello stesso ordine — anche se result
  // non è ancora disponibile, calcoliamo da un array vuoto.
  const validRows: ValidRow[] = useMemo(
    () => (result && result.ok ? result.valid : []),
    [result],
  );
  const { groups, singletons } = useMemo(
    () => groupMovements(validRows, { minGroupSize: 2 }),
    [validRows],
  );

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setStep("summary");
    setExcluded(new Set());
    setOverrides(new Map());
    setImportResult(null);
    setImportError(null);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setStep("summary");
    setExcluded(new Set());
    setOverrides(new Map());
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAnalyze() {
    if (!file) return;
    setImportError(null);
    const fd = new FormData();
    fd.append("file", file);
    startAnalyzing(async () => {
      const res = await analyzeExcelAction(fd);
      setResult(res);
      setStep("summary");
    });
  }

  function setCategoryFor(idx: number, categoryId: string | null) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(idx, categoryId);
      return next;
    });
  }

  function applyBulkToGroup(group: MovementGroup, categoryId: string | null) {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const r of group.rows) {
        next.set(r.sourceRowIndex, categoryId);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (!result || !result.ok || !file) return;
    setImportError(null);
    const manualCategories: Record<string, string | null> = {};
    for (const [idx, catId] of overrides) {
      manualCategories[String(idx)] = catId;
    }
    const metadata = {
      plan: result.plan,
      excludedSourceRowIndexes: Array.from(excluded),
      defaultIncomeCategoryId: defaultIncomeCat || null,
      defaultExpenseCategoryId: defaultExpenseCat || null,
      accountId: targetAccountId || null,
      manualCategories,
    };
    const fd = new FormData();
    fd.append("file", file);
    fd.append("metadata", JSON.stringify(metadata));
    startConfirming(async () => {
      const res = await confirmExcelImportAction(fd);
      if (res.ok) setImportResult({ inserted: res.inserted });
      else setImportError(res.error);
    });
  }

  // ===== STATE: SUCCESS =====
  if (importResult) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-muted p-8 flex flex-col items-center text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="text-base font-semibold mt-3">Import completato</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {importResult.inserted} movimenti aggiunti
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

  // ===== Componente riusabile: selettore conto destinazione =====
  const selectedAccount = accounts.find((a) => a.id === targetAccountId);
  const accountSelector = (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="rounded-md p-2 shrink-0"
            style={{ backgroundColor: (selectedAccount?.color ?? "#6b7280") + "20" }}
          >
            <Wallet
              className="h-4 w-4"
              style={{ color: selectedAccount?.color ?? "#6b7280" }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Conto destinazione
            </div>
            <div className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
              {selectedAccount ? (
                <>
                  {selectedAccount.name}
                  {selectedAccount.isPrimary && (
                    <Star
                      className="h-3 w-3 text-primary fill-primary"
                      aria-label="Conto principale"
                    />
                  )}
                  <Badge tone="neutral" className="ml-1">
                    {ACCOUNT_TYPE_LABEL[selectedAccount.type]}
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground">— Seleziona un conto —</span>
              )}
            </div>
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
    </div>
  );

  // ===== STATE: UPLOAD (no file) =====
  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        {accountSelector}
        <DropZone fileInputRef={fileInputRef} onFile={handleFile} />
      </div>
    );
  }

  // ===== STATE: file caricato, ma non ancora analizzato =====
  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        {accountSelector}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={reset} aria-label="Rimuovi">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="text-sm font-medium">Analisi automatica con AI</div>
          <div className="text-xs text-muted-foreground mt-1">
            Claude leggerà le prime 50 righe del file per identificare la banca e le colonne.
            Costo stimato: <span className="font-mono">~€0,02</span>.
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisi in corso…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analizza con AI
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={analyzing}>
              Annulla
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== STATE: errore analisi =====
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium text-danger">Analisi fallita</div>
          <div className="text-xs text-muted-foreground mt-0.5">{result.error}</div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={reset}>
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // WIZARD: result è disponibile + ok=true
  // ============================================================

  const validCount = validRows.length;

  // Conteggi per la summary
  const autoFromRules = validRows.filter((r) => r.suggestedFromRule).length;
  const inGroups = groups.reduce((s, g) => s + g.rows.length, 0);
  const singletonCount = singletons.length;
  const selectedCount = validCount - excluded.size;
  const manuallyCategorized = Array.from(overrides.values()).filter(
    (v) => v !== null,
  ).length;

  return (
    <div className="flex flex-col gap-5">
      {accountSelector}

      <WizardHeader step={step} />

      {step === "summary" && (
        <SummaryStep
          validCount={validCount}
          autoFromRules={autoFromRules}
          groupCount={groups.length}
          inGroups={inGroups}
          singletonCount={singletonCount}
          errors={result.errors.length}
          filtered={result.filtered}
          detectedSource={result.plan.detectedSource}
          confidence={result.plan.confidence}
          aiCost={result.cost.eur}
          notes={result.plan.notes}
          defaultIncomeCat={defaultIncomeCat}
          defaultExpenseCat={defaultExpenseCat}
          categories={categories}
          onDefaultIncomeChange={setDefaultIncomeCat}
          onDefaultExpenseChange={setDefaultExpenseCat}
          onBack={reset}
          onNext={() => setStep(groups.length > 0 ? "bulk" : "review")}
          onSkipToConfirm={() => setStep("confirm")}
        />
      )}

      {step === "bulk" && (
        <BulkStep
          groups={groups}
          categories={categories}
          overrides={overrides}
          onApplyToGroup={applyBulkToGroup}
          onCategoryCreated={(cat) =>
            setCategories((prev) =>
              [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
          onBack={() => setStep("summary")}
          onNext={() => setStep(singletons.length > 0 ? "review" : "confirm")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          rows={singletons}
          categories={categories}
          overrides={overrides}
          excluded={excluded}
          defaultIncomeCat={defaultIncomeCat}
          defaultExpenseCat={defaultExpenseCat}
          onSetCategoryFor={setCategoryFor}
          onToggleExclude={(idx) =>
            setExcluded((prev) => {
              const next = new Set(prev);
              if (next.has(idx)) next.delete(idx);
              else next.add(idx);
              return next;
            })
          }
          onCategoryCreated={(cat) =>
            setCategories((prev) =>
              [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
          onBack={() => setStep(groups.length > 0 ? "bulk" : "summary")}
          onNext={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          validCount={validCount}
          selectedCount={selectedCount}
          excluded={excluded.size}
          manuallyCategorized={manuallyCategorized}
          autoFromRules={autoFromRules}
          confirming={confirming}
          importError={importError}
          onBack={() =>
            setStep(singletons.length > 0 ? "review" : groups.length > 0 ? "bulk" : "summary")
          }
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

// ============================================================
// Wizard Step header (indicatore progresso)
// ============================================================

function WizardHeader({ step }: { step: WizardStep }) {
  const stepNames: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "summary", label: "Panoramica", icon: Sparkles },
    { key: "bulk", label: "Categorizza gruppi", icon: Layers },
    { key: "review", label: "Rivedi singole", icon: ListFilter },
    { key: "confirm", label: "Conferma import", icon: Check },
  ];
  const activeIdx = stepNames.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
      {stepNames.map((s, i) => {
        const Icon = s.icon;
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={
                "h-6 w-6 rounded-full border flex items-center justify-center font-medium shrink-0 " +
                (isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : isDone
                    ? "bg-success text-success-foreground border-success"
                    : "bg-background text-muted-foreground border-border")
              }
            >
              {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
            </div>
            <span
              className={
                "hidden sm:inline " +
                (isActive
                  ? "text-foreground font-medium"
                  : isDone
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60")
              }
            >
              {s.label}
            </span>
            {i < stepNames.length - 1 && (
              <div
                className={"h-px w-6 sm:w-12 " + (i < activeIdx ? "bg-success" : "bg-border")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// STEP 1 — SUMMARY (panoramica iniziale)
// ============================================================

function SummaryStep({
  validCount,
  autoFromRules,
  groupCount,
  inGroups,
  singletonCount,
  errors,
  filtered,
  detectedSource,
  confidence,
  aiCost,
  notes,
  defaultIncomeCat,
  defaultExpenseCat,
  categories,
  onDefaultIncomeChange,
  onDefaultExpenseChange,
  onBack,
  onNext,
  onSkipToConfirm,
}: {
  validCount: number;
  autoFromRules: number;
  groupCount: number;
  inGroups: number;
  singletonCount: number;
  errors: number;
  filtered: number;
  detectedSource: string;
  confidence: "high" | "medium" | "low";
  aiCost: number;
  notes: string | null;
  defaultIncomeCat: string;
  defaultExpenseCat: string;
  categories: CategoryOption[];
  onDefaultIncomeChange: (v: string) => void;
  onDefaultExpenseChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkipToConfirm: () => void;
}) {
  const incomeCats = categories.filter((c) => c.type === "income");
  const expenseCats = categories.filter((c) => c.type === "expense");
  const confidenceTone =
    confidence === "high" ? "success" : confidence === "medium" ? "primary" : "neutral";
  const confidenceLabel =
    confidence === "high"
      ? "Alta confidenza"
      : confidence === "medium"
        ? "Confidenza media"
        : "Bassa confidenza";

  return (
    <div className="flex flex-col gap-5">
      {/* Banca + AI info */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Banca riconosciuta: {detectedSource}</span>
          <Badge tone={confidenceTone}>{confidenceLabel}</Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            Costo analisi: €{aiCost.toFixed(4)}
          </span>
        </div>
        {notes && (
          <div className="text-xs text-muted-foreground mt-2">
            <span className="font-medium">Nota AI:</span> {notes}
          </div>
        )}
      </div>

      {/* KPI in stile dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Totale movimenti"
          value={validCount}
          icon={<Layers className="h-4 w-4 text-foreground" />}
          tone="neutral"
        />
        <StatCard
          label="✨ Auto-categorizzati"
          value={autoFromRules}
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          tone="primary"
          sub="dalle regole esistenti"
        />
        <StatCard
          label="In gruppi simili"
          value={inGroups}
          icon={<Layers className="h-4 w-4 text-foreground" />}
          tone="neutral"
          sub={`${groupCount} pattern raggruppati`}
        />
        <StatCard
          label="Da rivedere singolarmente"
          value={singletonCount}
          icon={<ListFilter className="h-4 w-4 text-foreground" />}
          tone="neutral"
        />
      </div>

      {(errors > 0 || filtered > 0) && (
        <div className="text-xs text-muted-foreground">
          {filtered > 0 && (
            <span>
              {filtered} righe escluse dai filtri AI (es. conversioni di valuta interne)
            </span>
          )}
          {filtered > 0 && errors > 0 && " · "}
          {errors > 0 && <span className="text-danger">{errors} righe con errore</span>}
        </div>
      )}

      {/* Categorie di default */}
      <section className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Categoria di default</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applicata alle righe che non hanno una regola match e per cui non hai scelto una categoria specifica.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 py-4">
          <div>
            <Label>Per le entrate</Label>
            <Select
              value={defaultIncomeCat}
              onChange={(e) => onDefaultIncomeChange(e.target.value)}
            >
              <option value="">— Nessuna —</option>
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Per le uscite</Label>
            <Select
              value={defaultExpenseCat}
              onChange={(e) => onDefaultExpenseChange(e.target.value)}
            >
              <option value="">— Nessuna —</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>
          <X className="h-4 w-4" />
          Annulla
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onSkipToConfirm} title="Salta direttamente all'import">
            Salta categorizzazione
          </Button>
          <Button onClick={onNext}>
            Procedi alla categorizzazione
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "neutral" | "primary" | "success";
  sub?: string;
}) {
  const valueClass =
    tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className={"text-2xl font-semibold tabular-nums mt-1 " + valueClass}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ============================================================
// STEP 2 — BULK (categorizza i gruppi)
// ============================================================

function BulkStep({
  groups,
  categories,
  overrides,
  onApplyToGroup,
  onCategoryCreated,
  onBack,
  onNext,
}: {
  groups: MovementGroup[];
  categories: CategoryOption[];
  overrides: Map<number, string | null>;
  onApplyToGroup: (group: MovementGroup, categoryId: string | null) => void;
  onCategoryCreated: (cat: CategoryOption) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">Categorizza i gruppi di movimenti</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {groups.length} {groups.length === 1 ? "gruppo" : "gruppi"} rilevati. Imposta una
          categoria per il gruppo e si applica a tutte le righe simili.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <GroupCard
            key={g.pattern}
            group={g}
            categories={categories}
            overrides={overrides}
            onApplyToGroup={onApplyToGroup}
            onCategoryCreated={onCategoryCreated}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
        <Button onClick={onNext}>
          Procedi alle righe singole
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  categories,
  overrides,
  onApplyToGroup,
  onCategoryCreated,
}: {
  group: MovementGroup;
  categories: CategoryOption[];
  overrides: Map<number, string | null>;
  onApplyToGroup: (group: MovementGroup, categoryId: string | null) => void;
  onCategoryCreated: (cat: CategoryOption) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Determina la categoria attualmente assegnata al gruppo:
  // - Se tutte le righe hanno lo stesso override → mostra quella
  // - Altrimenti → mostra la suggested
  const distinctOverrides = new Set(
    group.rows.map((r) =>
      overrides.has(r.sourceRowIndex)
        ? overrides.get(r.sourceRowIndex) ?? ""
        : null,
    ),
  );
  let groupCategoryId: string | null = null;
  if (distinctOverrides.size === 1) {
    const v = Array.from(distinctOverrides)[0];
    groupCategoryId = v === null ? group.suggestedCategoryId : (v === "" ? null : v);
  } else {
    groupCategoryId = group.suggestedCategoryId;
  }

  const isUniformCategory = distinctOverrides.size === 1;

  // Tipo dominante per filtrare le categorie
  const incomeCount = group.rows.filter((r) => r.type === "income").length;
  const expenseCount = group.rows.length - incomeCount;
  const dominantType: "income" | "expense" =
    incomeCount > expenseCount ? "income" : "expense";

  const visibleRows = expanded ? group.rows : group.rows.slice(0, 3);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone="neutral">{group.rows.length} righe</Badge>
          <span className="text-sm font-medium truncate">
            Pattern: <code className="font-mono text-xs">{group.pattern}</code>
          </span>
          {group.fromRule && !isUniformCategory && (
            <Badge tone="primary">
              <Sparkles className="h-3 w-3 inline mr-0.5" />
              Da regola
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 sm:w-auto w-full">
          <div className="flex-1 min-w-[200px]">
            <CategoryCombo
              categories={categories}
              value={groupCategoryId}
              onChange={(id) => onApplyToGroup(group, id)}
              filterType={dominantType}
              newCategoryType={dominantType}
              placeholder="— Imposta categoria del gruppo —"
              onCategoryCreated={(cat) => {
                onCategoryCreated(cat);
                onApplyToGroup(group, cat.id);
              }}
              className="text-xs"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {visibleRows.map((r) => (
              <tr key={r.sourceRowIndex} className="text-xs">
                <td className="px-4 py-2 text-muted-foreground tabular-nums whitespace-nowrap w-24">
                  {formatDate(new Date(r.date))}
                </td>
                <td className="px-3 py-2 truncate max-w-md" title={r.description}>
                  {r.description}
                </td>
                <td
                  className={
                    "px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap w-28 " +
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
        {group.rows.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-t border-border flex items-center justify-center gap-1"
          >
            <ChevronDown
              className={
                "h-3 w-3 transition-transform " + (expanded ? "rotate-180" : "")
              }
            />
            {expanded
              ? "Comprimi"
              : `Vedi altre ${group.rows.length - 3} righe`}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP 3 — REVIEW (righe singole)
// ============================================================

function ReviewStep({
  rows,
  categories,
  overrides,
  excluded,
  defaultIncomeCat,
  defaultExpenseCat,
  onSetCategoryFor,
  onToggleExclude,
  onCategoryCreated,
  onBack,
  onNext,
}: {
  rows: ValidRow[];
  categories: CategoryOption[];
  overrides: Map<number, string | null>;
  excluded: Set<number>;
  defaultIncomeCat: string;
  defaultExpenseCat: string;
  onSetCategoryFor: (idx: number, categoryId: string | null) => void;
  onToggleExclude: (idx: number) => void;
  onCategoryCreated: (cat: CategoryOption) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function resolveCategoryId(r: ValidRow): string | null {
    if (overrides.has(r.sourceRowIndex)) return overrides.get(r.sourceRowIndex) ?? null;
    if (r.suggestedCategoryId) return r.suggestedCategoryId;
    return r.type === "income" ? (defaultIncomeCat || null) : (defaultExpenseCat || null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">Rivedi le righe singole</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} righe non raggruppabili. Imposta categoria singola o spunta per escludere.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Nessuna riga singola da rivedere. Procedi alla conferma.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-8"></th>
                  <th className="text-left font-medium px-3 py-2 w-24">Data</th>
                  <th className="text-left font-medium px-3 py-2">Descrizione</th>
                  <th className="text-left font-medium px-3 py-2 w-56">Categoria</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 300).map((r) => {
                  const isExcluded = excluded.has(r.sourceRowIndex);
                  const hasOverride = overrides.has(r.sourceRowIndex);
                  const resolvedCat = resolveCategoryId(r);

                  return (
                    <tr
                      key={r.sourceRowIndex}
                      className={
                        (isExcluded ? "opacity-40 " : "hover:bg-muted/30 ") +
                        "transition-colors"
                      }
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => onToggleExclude(r.sourceRowIndex)}
                          className="h-3.5 w-3.5 rounded border-input"
                          title="Includi nell'import"
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDate(new Date(r.date))}
                      </td>
                      <td
                        className={
                          "px-3 py-2 max-w-md " + (isExcluded ? "line-through" : "")
                        }
                      >
                        <div className="truncate" title={r.description}>
                          {r.description}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {r.suggestedFromRule && !hasOverride && (
                            <Sparkles
                              className="h-3 w-3 text-primary shrink-0"
                              aria-label="Pre-categorizzata da regola esistente"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <CategoryCombo
                              categories={categories}
                              value={resolvedCat}
                              onChange={(id) => onSetCategoryFor(r.sourceRowIndex, id)}
                              filterType={r.type}
                              newCategoryType={r.type}
                              placeholder="— Nessuna —"
                              onCategoryCreated={(cat) => {
                                onCategoryCreated(cat);
                                onSetCategoryFor(r.sourceRowIndex, cat.id);
                              }}
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap " +
                          (r.type === "income" ? "text-success" : "text-danger") +
                          (isExcluded ? " line-through" : "")
                        }
                      >
                        {r.type === "income" ? "+" : "−"}
                        {formatCurrency(r.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 300 && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
                Mostrate le prime 300 righe su {rows.length}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
        <Button onClick={onNext}>
          Procedi alla conferma
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// STEP 4 — CONFIRM (riepilogo finale e import)
// ============================================================

function ConfirmStep({
  validCount,
  selectedCount,
  excluded,
  manuallyCategorized,
  autoFromRules,
  confirming,
  importError,
  onBack,
  onConfirm,
}: {
  validCount: number;
  selectedCount: number;
  excluded: number;
  manuallyCategorized: number;
  autoFromRules: number;
  confirming: boolean;
  importError: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">Conferma e importa</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pronto per il salvataggio finale. Da qui in poi non puoi tornare indietro.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Totale rilevati"
          value={validCount}
          icon={<Layers className="h-4 w-4 text-foreground" />}
          tone="neutral"
        />
        <StatCard
          label="✨ Auto da regole"
          value={autoFromRules}
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          tone="primary"
        />
        <StatCard
          label="Manuali"
          value={manuallyCategorized}
          icon={<Check className="h-4 w-4 text-success" />}
          tone="success"
        />
        <StatCard
          label="Esclusi"
          value={excluded}
          icon={<X className="h-4 w-4 text-muted-foreground" />}
          tone="neutral"
        />
      </div>

      {importError && (
        <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <span className="text-sm text-danger">{importError}</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={confirming}>
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
        <Button onClick={onConfirm} disabled={confirming || selectedCount === 0}>
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Import in corso…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Importa {selectedCount} movimenti
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// DropZone (riusato da prima)
// ============================================================

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
      <Sparkles className="h-8 w-8 text-primary" />
      <p className="text-sm font-medium mt-3">
        Trascina qui un Excel di movimenti bancari
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Funziona con Intesa Sanpaolo, PayPal, Unicredit, e qualsiasi altra banca.{" "}
        L&apos;AI riconosce automaticamente il formato.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
