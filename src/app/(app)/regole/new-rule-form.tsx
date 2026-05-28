"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  ArrowLeftRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  createCategoryRuleAction,
  createTransferRuleAction,
} from "./actions";

type Category = { id: string; name: string; type: "income" | "expense" };
type Account = { id: string; name: string; type: string };

type Mode = null | "category" | "transfer";

export function NewRuleButton({
  categories,
  accounts,
}: {
  categories: Category[];
  accounts: Account[];
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Chiudi dropdown su click esterno o ESC
  useEffect(() => {
    if (!dropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [dropdownOpen]);

  function pick(m: Mode) {
    setMode(m);
    setDropdownOpen(false);
  }

  return (
    <>
      <div ref={dropdownRef} className="relative">
        <Button onClick={() => setDropdownOpen(!dropdownOpen)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova regola
          <ChevronDown className="h-3.5 w-3.5 -mr-1" />
        </Button>
        {dropdownOpen && (
          <div className="absolute right-0 mt-1 w-64 rounded-md border border-border bg-background shadow-lg z-40 p-1">
            <button
              type="button"
              onClick={() => pick("category")}
              className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left hover:bg-muted"
            >
              <Tag className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Regola di categorizzazione</div>
                <div className="text-[11px] text-muted-foreground">
                  Pattern → categoria
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => pick("transfer")}
              className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left hover:bg-muted"
            >
              <ArrowLeftRight className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Regola di trasferimento</div>
                <div className="text-[11px] text-muted-foreground">
                  Pattern → conto destinazione
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {mode === "category" && (
        <SingleFormModal
          title="Nuova regola di categorizzazione"
          icon={<Tag className="h-4 w-4 text-blue-600" />}
          onClose={() => setMode(null)}
        >
          <CategoryRuleForm categories={categories} onCreated={() => setMode(null)} />
        </SingleFormModal>
      )}

      {mode === "transfer" && (
        <SingleFormModal
          title="Nuova regola di trasferimento"
          icon={<ArrowLeftRight className="h-4 w-4 text-blue-600" />}
          onClose={() => setMode(null)}
        >
          <TransferRuleForm accounts={accounts} onCreated={() => setMode(null)} />
        </SingleFormModal>
      )}
    </>
  );
}

function SingleFormModal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg border border-border shadow-xl max-w-xl w-full my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}


function CategoryRuleForm({
  categories,
  onCreated,
}: {
  categories: Category[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [movementType, setMovementType] = useState<"income" | "expense" | "any">("any");
  const [result, setResult] = useState<{ ok: boolean; msg?: string } | null>(null);

  function handleSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await createCategoryRuleAction({
        pattern: pattern.trim().toLowerCase(),
        categoryId,
        movementType,
      });
      if (res.ok) {
        setResult({ ok: true });
        setPattern("");
        setCategoryId("");
        setMovementType("any");
        router.refresh();
        onCreated?.();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">Regola di categorizzazione</div>
      <p className="text-xs text-muted-foreground -mt-1">
        Se la descrizione del movimento contiene il pattern, viene assegnata la categoria.
      </p>

      <div>
        <Label htmlFor="cat-pattern">Pattern</Label>
        <Input
          id="cat-pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder='es. "anthropic"'
          disabled={pending}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Case-insensitive. Match come substring sulla descrizione.
        </p>
      </div>

      <div>
        <Label htmlFor="cat-category">Categoria</Label>
        <Select
          id="cat-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={pending}
        >
          <option value="">Seleziona…</option>
          <optgroup label="Entrate">
            {categories
              .filter((c) => c.type === "income")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Uscite">
            {categories
              .filter((c) => c.type === "expense")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        </Select>
      </div>

      <div>
        <Label htmlFor="cat-type">Applica a</Label>
        <Select
          id="cat-type"
          value={movementType}
          onChange={(e) =>
            setMovementType(e.target.value as "income" | "expense" | "any")
          }
          disabled={pending}
        >
          <option value="any">Entrate e uscite</option>
          <option value="income">Solo entrate</option>
          <option value="expense">Solo uscite</option>
        </Select>
      </div>

      {result?.ok && (
        <div className="flex items-center gap-2 text-xs text-green-900">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-700" /> Regola creata
        </div>
      )}
      {result && !result.ok && (
        <div className="flex items-center gap-2 text-xs text-red-900">
          <AlertCircle className="h-3.5 w-3.5" /> {result.msg}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={pending || !pattern.trim() || !categoryId}
        className="gap-2 self-start"
        size="sm"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Crea regola
      </Button>
    </div>
  );
}

function TransferRuleForm({
  accounts,
  onCreated,
}: {
  accounts: Account[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pattern, setPattern] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg?: string } | null>(null);

  function handleSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await createTransferRuleAction({
        pattern: pattern.trim().toLowerCase(),
        targetAccountId,
        sourceAccountId: sourceAccountId || null,
      });
      if (res.ok) {
        setResult({ ok: true });
        setPattern("");
        setTargetAccountId("");
        setSourceAccountId("");
        router.refresh();
        onCreated?.();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">Regola di trasferimento</div>
      <p className="text-xs text-muted-foreground -mt-1">
        Movimenti che matchano il pattern vengono marcati come trasferimento (esclusi dal P&amp;L).
      </p>

      <div>
        <Label htmlFor="tr-pattern">Pattern</Label>
        <Input
          id="tr-pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder='es. "saldo e/c carta"'
          disabled={pending}
        />
      </div>

      <div>
        <Label htmlFor="tr-target">Conto destinazione</Label>
        <Select
          id="tr-target"
          value={targetAccountId}
          onChange={(e) => setTargetAccountId(e.target.value)}
          disabled={pending}
        >
          <option value="">Seleziona…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="tr-source">Solo da conto (opzionale)</Label>
        <Select
          id="tr-source"
          value={sourceAccountId}
          onChange={(e) => setSourceAccountId(e.target.value)}
          disabled={pending}
        >
          <option value="">Tutti i conti</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">
          Limita la regola ai movimenti di un conto specifico.
        </p>
      </div>

      {result?.ok && (
        <div className="flex items-center gap-2 text-xs text-green-900">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-700" /> Regola creata
        </div>
      )}
      {result && !result.ok && (
        <div className="flex items-center gap-2 text-xs text-red-900">
          <AlertCircle className="h-3.5 w-3.5" /> {result.msg}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={pending || !pattern.trim() || !targetAccountId}
        className="gap-2 self-start"
        size="sm"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Crea regola
      </Button>
    </div>
  );
}
