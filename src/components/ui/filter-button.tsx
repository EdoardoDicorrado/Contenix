"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { OverlayModal } from "@/components/ui/overlay-modal";
import { cn } from "@/lib/utils";

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type Props<T extends string> = {
  /** Etichetta del filtro mostrata nel pulsante (es. "Tipo") */
  label: string;
  /** Lista opzioni */
  options: FilterOption<T>[];
  /** Valore attuale */
  value: T;
  /** Quando cambia */
  onChange: (v: T) => void;
  /**
   * Soglia oltre la quale si usa overlay invece di popover.
   * Default 4: ≤4 popover, >4 overlay.
   */
  overlayThreshold?: number;
  /** Titolo overlay (se popover non basta). Default: label */
  overlayTitle?: string;
  /** Icona dell'overlay */
  overlayIcon?: React.ReactNode;
  className?: string;
};

/**
 * Filter button con label + valore corrente + chevron.
 * Stile coerente con i pulsanti di /movimenti:
 *  - sfondo neutro a riposo
 *  - bordo blu + bg blu chiaro quando un valore è selezionato (≠ primo opt)
 *
 * Apertura:
 *  - se options.length ≤ overlayThreshold → popover dropdown
 *  - se options.length > overlayThreshold → overlay modale full
 */
export function FilterButton<T extends string>({
  label,
  options,
  value,
  onChange,
  overlayThreshold = 4,
  overlayTitle,
  overlayIcon,
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const useOverlay = options.length > overlayThreshold;
  const currentLabel =
    options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "—";
  const isDefault = options[0]?.value === value;

  // Chiudi popover su click esterno / ESC (solo se modalità popover)
  useEffect(() => {
    if (useOverlay || !open) return;
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
  }, [open, useOverlay]);

  function pick(v: T) {
    onChange(v);
    setOpen(false);
  }

  function clearFilter(e: React.MouseEvent) {
    e.stopPropagation();
    if (options[0]) onChange(options[0].value);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs",
          !isDefault
            ? "border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100"
            : "border-input bg-background text-foreground hover:bg-muted",
        )}
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium max-w-32 truncate">{currentLabel}</span>
        {!isDefault && (
          <span
            role="button"
            tabIndex={0}
            onClick={clearFilter}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clearFilter(e as unknown as React.MouseEvent);
              }
            }}
            className="ml-0.5 -mr-1 p-0.5 rounded hover:bg-blue-200 cursor-pointer"
            aria-label="Rimuovi filtro"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {isDefault && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {/* Popover dropdown (≤ threshold) */}
      {open && !useOverlay && (
        <div className="absolute z-40 left-0 mt-1 min-w-48 rounded-md border border-border bg-background shadow-lg p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm hover:bg-muted text-left",
                opt.value === value && "font-medium",
              )}
            >
              <span className="flex-1">{opt.label}</span>
              {opt.value === value && <Check className="h-3.5 w-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}

      {/* Overlay modale (> threshold) */}
      {open && useOverlay && (
        <OverlayModal
          title={overlayTitle ?? label}
          icon={overlayIcon}
          onClose={() => setOpen(false)}
          size="sm"
        >
          <div className="flex flex-col gap-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2 rounded-md text-left transition-colors",
                  opt.value === value
                    ? "bg-blue-50 text-blue-900"
                    : "hover:bg-muted",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.description && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {opt.description}
                    </div>
                  )}
                </div>
                {opt.value === value && (
                  <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        </OverlayModal>
      )}
    </div>
  );
}
