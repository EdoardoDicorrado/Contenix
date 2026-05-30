"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * Trigger ricerca nel rail: apre la command palette via stesso hotkey
 * Cmd+K / Ctrl+K. Stile coerente con RailIcon (48×48, tooltip).
 */
export function RailSearch() {
  const [isMac, setIsMac] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
      }),
    );
  }

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Cerca"
      className="group relative h-12 w-12 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <Search className="h-5 w-5" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        Cerca · {isMac ? "⌘K" : "Ctrl+K"}
      </span>
    </button>
  );
}

/**
 * Avatar utente nel rail. Per ora mostra solo l'iniziale dell'email;
 * il click apre un popover con info utente / logout (TODO).
 */
export function RailUser({ initial = "E", email }: { initial?: string; email?: string }) {
  return (
    <button
      type="button"
      aria-label={email ?? "Utente"}
      className="group relative h-12 w-12 inline-flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
    >
      <span className="h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-medium text-foreground">
        {initial}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        {email ?? "Utente"}
      </span>
    </button>
  );
}
