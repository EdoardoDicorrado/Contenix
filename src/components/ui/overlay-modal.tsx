"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Overlay modale generico:
 * - sfondo scuro (bg-black/70)
 * - centrato (vert+horiz)
 * - click sul backdrop chiude
 * - ESC chiude
 * - Header con titolo + X
 *
 * Se `requireExplicitClose` è true, click sul backdrop / ESC non chiudono:
 * l'utente deve usare i bottoni interni. Usato per il conflict-modal.
 */
export function OverlayModal({
  title,
  icon,
  onClose,
  children,
  size = "md",
  requireExplicitClose = false,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  requireExplicitClose?: boolean;
}) {
  useEffect(() => {
    if (requireExplicitClose) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose, requireExplicitClose]);

  const widthClass = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => {
        if (!requireExplicitClose) onClose();
      }}
    >
      <div
        className={`bg-background rounded-lg border border-border shadow-xl ${widthClass} w-full my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          {!requireExplicitClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
