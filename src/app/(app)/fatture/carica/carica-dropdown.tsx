"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ChevronDown, FileCode, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pulsante principale "Carica fatture" con dropdown che apre la sotto-pagina
 * giusta (cassetto fiscale XML/PDF/ZIP, oppure estero PDF only).
 *
 * Stesso stile e pattern di NewRuleButton / SyncLauncher.
 */
export function CaricaDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const items = [
    {
      href: "/fatture/carica/cassetto",
      label: "Cassetto fiscale",
      description: "XML FatturaPA, PDF e ZIP — lettura automatica per gli XML SDI",
      icon: <FileCode className="h-4 w-4" />,
    },
    {
      href: "/fatture/carica/estero",
      label: "Fatture estere",
      description: "PDF di fatture estere o cartacee — dati estratti con AI",
      icon: <FileText className="h-4 w-4" />,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
          "bg-foreground text-background hover:opacity-90 transition-colors",
        )}
      >
        <Upload className="h-4 w-4" />
        Carica fatture
        <ChevronDown className="h-3.5 w-3.5 -mr-1" />
      </button>
      {open && (
        <div className="absolute z-40 right-0 mt-1 w-80 rounded-md border border-border bg-background shadow-lg p-1">
          {items.map((it) => (
            <button
              key={it.href}
              type="button"
              onClick={() => go(it.href)}
              className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors hover:bg-muted"
            >
              <div className="text-foreground mt-0.5">{it.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {it.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
