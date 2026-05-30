"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search as SearchIcon,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  Tags,
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  ListFilter,
  Wand2,
  History,
  Upload,
  AlertCircle,
  Plus,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  commandSearchAction,
  type CommandResult,
} from "@/app/(app)/command-search-actions";

const STATIC_PAGES = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, keywords: "home" },
  { label: "Conti", href: "/conti", icon: Wallet },
  { label: "Movimenti", href: "/movimenti", icon: ArrowLeftRight },
  { label: "Movimenti da rivedere", href: "/movimenti/da-rivedere", icon: AlertCircle },
  { label: "Fatture", href: "/fatture", icon: FileText },
  { label: "Fatture da rivedere", href: "/fatture/da-rivedere", icon: AlertCircle },
  { label: "Dipendenti", href: "/dipendenti", icon: Users },
  { label: "Categorie", href: "/categorie", icon: Tags },
  { label: "Regole", href: "/regole", icon: ListFilter },
  { label: "Sincronizza", href: "/sincronizza", icon: Wand2 },
  { label: "Storico cambiamenti", href: "/storico-cambiamenti", icon: History },
  { label: "Importa movimenti", href: "/importa", icon: Upload },
  { label: "Importa fatture", href: "/fatture/carica", icon: FileText },
  { label: "Importa storico", href: "/importa-storico", icon: History },
  { label: "Nuova fattura", href: "/fatture/nuovo", icon: Plus },
] as const;

const EMPTY: CommandResult = {
  invoices: [],
  movements: [],
  categories: [],
  accounts: [],
};

/**
 * Command palette globale (Cmd+K / Ctrl+K). Cerca su fatture, movimenti,
 * categorie, conti + lista statica delle pagine.
 *
 * - Hotkey global: Cmd+K (mac) o Ctrl+K (win)
 * - Search server-side via `commandSearchAction` (debounced 150ms)
 * - Enter su un risultato → naviga
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandResult>(EMPTY);
  const [pending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  // Hotkey global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset query on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await commandSearchAction(query);
          setResults(res);
        } catch {
          setResults(EMPTY);
        }
      });
    }, 150);
    return () => clearTimeout(t);
  }, [open, query]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  const totalResults =
    results.invoices.length +
    results.movements.length +
    results.categories.length +
    results.accounts.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <Command
        label="Command palette"
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl mt-16 overflow-hidden flex flex-col"
        shouldFilter={false}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <SearchIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Cerca fatture, movimenti, categorie, conti, pagine…"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground"
            autoFocus
          />
          {pending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-2 py-1">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[65vh] overflow-y-auto p-3">
          {query.trim().length < 2 && (
            <Command.Group heading="Pagine" className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
              {STATIC_PAGES.map((p) => {
                const Icon = p.icon;
                return (
                  <Command.Item
                    key={p.href}
                    value={`${p.label} ${"keywords" in p ? p.keywords : ""}`}
                    onSelect={() => go(p.href)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-foreground cursor-pointer data-[selected=true]:bg-muted"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{p.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {query.trim().length >= 2 && totalResults === 0 && !pending && (
            <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nessun risultato per &ldquo;{query}&rdquo;
            </Command.Empty>
          )}

          {results.invoices.length > 0 && (
            <Command.Group
              heading="Fatture"
              className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 mt-2"
            >
              {results.invoices.map((inv) => (
                <Command.Item
                  key={inv.id}
                  value={`fattura-${inv.id}-${inv.number}-${inv.counterpartyName}`}
                  onSelect={() => go(`/fatture/${inv.id}`)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:bg-muted"
                >
                  {inv.type === "sale" ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-danger shrink-0" />
                  )}
                  <span className="font-mono text-xs shrink-0">{inv.number}</span>
                  <span className="text-muted-foreground truncate">
                    {inv.counterpartyName}
                  </span>
                  <span className="ml-auto tabular-nums text-xs text-muted-foreground shrink-0">
                    {formatCurrency(parseFloat(inv.totalAmount))}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.movements.length > 0 && (
            <Command.Group
              heading="Movimenti"
              className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 mt-2"
            >
              {results.movements.map((m) => {
                const isIncome = m.type === "income";
                const amt = Math.abs(parseFloat(m.amount));
                return (
                  <Command.Item
                    key={m.id}
                    value={`movimento-${m.id}-${m.description}`}
                    onSelect={() =>
                      go(
                        `/movimenti?period=month&month=${new Date(m.date)
                          .toISOString()
                          .slice(0, 7)}`,
                      )
                    }
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:bg-muted"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {formatDate(new Date(m.date))}
                    </span>
                    <span className="truncate flex-1">{m.description}</span>
                    <span
                      className={`tabular-nums text-xs shrink-0 ${isIncome ? "text-success" : "text-danger"}`}
                    >
                      {isIncome ? "+" : "−"}
                      {formatCurrency(amt)}
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {results.categories.length > 0 && (
            <Command.Group
              heading="Categorie"
              className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 mt-2"
            >
              {results.categories.map((c) => (
                <Command.Item
                  key={c.id}
                  value={`categoria-${c.id}-${c.name}`}
                  onSelect={() => go(`/categorie?focus=${c.id}`)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:bg-muted"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color ?? "#a1a1aa" }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {c.type === "income" ? "Entrata" : "Uscita"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.accounts.length > 0 && (
            <Command.Group
              heading="Conti"
              className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 mt-2"
            >
              {results.accounts.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`conto-${a.id}-${a.name}`}
                  onSelect={() => go(`/conti/${a.id}`)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:bg-muted"
                >
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {a.type}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-border rounded px-1 py-0.5">↑↓</kbd>
            naviga
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-border rounded px-1 py-0.5">↵</kbd>
            apri
          </span>
          <span className="inline-flex items-center gap-1 ml-auto">
            <kbd className="border border-border rounded px-1 py-0.5">Ctrl</kbd>
            +
            <kbd className="border border-border rounded px-1 py-0.5">K</kbd>
          </span>
        </div>
      </Command>
    </div>
  );
}
