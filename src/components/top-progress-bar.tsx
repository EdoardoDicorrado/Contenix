"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barra di caricamento sottile in cima alla pagina (stile NProgress / GitHub /
 * Linear). Funzionamento:
 *
 *  - Ascolta i click "globali" su anchor con href interno: appena ne intercetta
 *    uno, parte la barra con animazione progressiva (0 → 90%) entro pochi ms.
 *  - Quando il pathname o i searchParams cambiano, completa al 100% e fade out.
 *  - Se la nuova route arriva immediatamente (prefetched/static) la barra è
 *    impercettibile; per route lente diventa visibile e rassicurante.
 *
 * Nessuna dipendenza esterna, niente layout shift (posizione fixed top).
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  function start() {
    if (activeRef.current) return;
    activeRef.current = true;
    if (hideRef.current) clearTimeout(hideRef.current);
    setVisible(true);
    setProgress(8);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p; // si ferma vicino alla fine
        // incremento decrescente: più sale, più rallenta
        const delta = Math.max(0.5, (90 - p) * 0.07);
        return Math.min(90, p + delta);
      });
    }, 120);
  }

  function done() {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setProgress(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  }

  // Intercetta click sui link interni e fa partire la barra
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // ignora middle click / ctrl+click / shift+click (aprono in nuova tab)
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // solo navigazione interna (relative or same-origin) e non hash-only
      if (href.startsWith("#")) return;
      if (href.startsWith("http")) {
        try {
          const u = new URL(href);
          if (u.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }
      if (anchor.target && anchor.target !== "_self") return;
      // download e mailto/tel → skip
      if (anchor.hasAttribute("download")) return;
      const proto = href.split(":")[0];
      if (["mailto", "tel"].includes(proto)) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Quando cambia la route, completa
  useEffect(() => {
    done();
    // pathname + searchParams.toString() come dipendenze: anche solo query change
    // chiude la barra (ad es. filtri).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  // Cleanup all'unmount
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
      style={{ height: 2 }}
    >
      <div
        className="h-full bg-foreground"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition:
            "width 200ms cubic-bezier(.4,0,.2,1), opacity 250ms ease-out",
          boxShadow: visible ? "0 0 8px 0 var(--foreground)" : "none",
        }}
      />
    </div>
  );
}
