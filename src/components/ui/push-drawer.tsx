"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowLeft } from "lucide-react";

/**
 * Push drawer: pannello laterale destro che si aggiunge al layout flex
 * genitore (slot #push-drawer-root) e fa rimpicciolire il main content.
 *
 * Regole:
 *  - Larghezza fissa DRAWER_WIDTH (uniforme in tutta l'app).
 *  - Esclusività drawer primari (non-stacked): aprire un primario chiude
 *    automaticamente l'eventuale altro primario aperto.
 *  - Drawer "stacked" si sovrappone a un primario (per drill-down) e si
 *    chiude solo con la freccia "← Indietro".
 *  - Niente chiusura su click esterno o ESC.
 *  - X grande/spessa solo sui primari.
 */

/** Larghezza preferita (max) dei drawer su monitor grandi. Si rimpicciolisce
 *  su schermi piccoli via useResponsiveDrawerWidth. */
export const DRAWER_WIDTH = 520;
/** Larghezza minima del drawer su laptop piccoli. Sotto i font si
 *  rimpiccioliscono via container query (vedi @container nell'aside). */
const DRAWER_MIN = 280;
/** Interpolazione lineare drawer-width sulla viewport:
 *  - viewport ≤ 1024 → DRAWER_MIN (280) — laptop piccoli
 *  - viewport ≥ 1700 → DRAWER_WIDTH (520) — desktop grandi
 *  - in mezzo → lineare. Esempi: 1280→370, 1440→428, 1600→485. */
const SCALE_MIN_VW = 1024;
const SCALE_MAX_VW = 1700;

const DRAWER_ACTIVE_EVT = "push-drawer-active";
const SPRING = { type: "spring" as const, damping: 28, stiffness: 240, mass: 0.9 };

function computeDrawerWidth(vw: number): number {
  if (vw <= SCALE_MIN_VW) return DRAWER_MIN;
  if (vw >= SCALE_MAX_VW) return DRAWER_WIDTH;
  const t = (vw - SCALE_MIN_VW) / (SCALE_MAX_VW - SCALE_MIN_VW);
  return Math.round(DRAWER_MIN + t * (DRAWER_WIDTH - DRAWER_MIN));
}

/**
 * Calcola la larghezza del drawer in base alla viewport corrente:
 *  - laptop piccoli (≤1024) → width minima 280
 *  - desktop grandi (≥1700) → width max 520
 *  - in mezzo → interpolazione lineare
 * Aggiorna su window resize.
 */
function useResponsiveDrawerWidth(): number {
  const [w, setW] = useState(() =>
    typeof window === "undefined"
      ? DRAWER_WIDTH
      : computeDrawerWidth(window.innerWidth),
  );
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    function onResize() {
      setW(computeDrawerWidth(window.innerWidth));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return w;
}

export function PushDrawer({
  open,
  onClose,
  title,
  subtitle,
  stacked = false,
  backLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Se true, renderizza sopra eventuali drawer push esistenti (overlay). */
  stacked?: boolean;
  /** Etichetta del bottone "← Indietro" (solo in stacked). Default: "Indietro". */
  backLabel?: string;
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const myId = useId();
  const drawerWidth = useResponsiveDrawerWidth();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSlot(document.getElementById("push-drawer-root"));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Esclusività drawer primari
  useEffect(() => {
    if (stacked) return;
    if (open) {
      document.dispatchEvent(
        new CustomEvent(DRAWER_ACTIVE_EVT, { detail: { id: myId } }),
      );
    }
    function onOther(e: Event) {
      const ce = e as CustomEvent<{ id: string }>;
      if (open && ce.detail.id !== myId) onClose();
    }
    document.addEventListener(DRAWER_ACTIVE_EVT, onOther);
    return () => document.removeEventListener(DRAWER_ACTIVE_EVT, onOther);
  }, [open, stacked, myId, onClose]);

  if (!slot) return null;

  const headerInner = (
    <header className="flex items-start justify-between gap-3 px-4 @lg:px-5 py-3 @lg:py-4 border-b border-border shrink-0">
      <div className="min-w-0 flex-1 flex flex-col gap-1.5 @lg:gap-2">
        {stacked && (
          <button
            type="button"
            onClick={onClose}
            className="self-start inline-flex items-center gap-1.5 text-[11px] @lg:text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3 @lg:h-3.5 @lg:w-3.5" />
            {backLabel ?? "Indietro"}
          </button>
        )}
        {title && (
          <div className="text-sm @lg:text-lg font-semibold tracking-tight">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="text-[11px] @lg:text-sm text-muted-foreground -mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {!stacked && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="p-1 -mr-1 -mt-0.5 rounded-md text-foreground hover:bg-muted shrink-0 cursor-pointer"
        >
          <X className="h-5 w-5 @lg:h-6 @lg:w-6" strokeWidth={2.5} />
        </button>
      )}
    </header>
  );

  const inner = (
    <motion.div
      initial={{ x: stacked ? drawerWidth : 40, opacity: stacked ? 1 : 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: stacked ? drawerWidth : 40, opacity: stacked ? 1 : 0 }}
      transition={SPRING}
      style={{ width: drawerWidth }}
      className="@container h-full flex flex-col bg-background"
    >
      {headerInner}
      <div className="flex-1 overflow-y-auto px-4 @lg:px-5 py-3 @lg:py-4">
        {children}
      </div>
    </motion.div>
  );

  if (stacked) {
    return createPortal(
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ width: drawerWidth }}
            className="absolute right-0 inset-y-0 z-50 border-l border-border shadow-2xl"
            role="complementary"
          >
            {inner}
          </motion.aside>
        )}
      </AnimatePresence>,
      slot,
    );
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0 }}
          animate={{ width: drawerWidth }}
          exit={{ width: 0 }}
          transition={SPRING}
          className="shrink-0 overflow-hidden border-l border-border bg-background self-stretch"
          role="complementary"
        >
          {inner}
        </motion.aside>
      )}
    </AnimatePresence>,
    slot,
  );
}
