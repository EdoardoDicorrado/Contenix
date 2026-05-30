"use client";

import { Info } from "lucide-react";

/**
 * Icona "info" piccola con tooltip al hover/focus.
 * Tooltip CSS-only (group-hover) → niente JS state, niente flicker.
 *
 * Usage:
 *   <span className="inline-flex items-center gap-2">
 *     Titolo
 *     <InfoTooltip>Spiegazione qui</InfoTooltip>
 *   </span>
 */
export function InfoTooltip({
  children,
  side = "bottom",
  className,
}: {
  children: React.ReactNode;
  /** Posizione del tooltip. Default "bottom". */
  side?: "bottom" | "right";
  className?: string;
}) {
  const positionClass =
    side === "right"
      ? "left-full top-1/2 -translate-y-1/2 ml-2"
      : "top-full left-0 mt-1.5";

  return (
    <span
      className={
        "group relative inline-flex items-center justify-center align-middle " +
        (className ?? "")
      }
      tabIndex={0}
      aria-label="Informazioni"
    >
      <Info className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
      <span
        role="tooltip"
        className={
          "pointer-events-none absolute z-50 max-w-xs w-max rounded-md bg-foreground text-background text-xs px-2.5 py-2 leading-relaxed opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-md whitespace-normal " +
          positionClass
        }
      >
        {children}
      </span>
    </span>
  );
}
