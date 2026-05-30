"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Drawer laterale destro stile Qonto/Linear.
 *  - Slide-in da destra all'apertura, slide-out a destra alla chiusura.
 *  - NON copre la sidebar (è ancorato alla viewport ma rispetta layout
 *    parent flex; usando `right-0 inset-y-0` si fissa al bordo destro).
 *  - Backdrop semi-trasparente cliccabile per chiudere.
 *  - ESC chiude.
 *  - Larghezza fissa (default 420px).
 *
 * Uso:
 *   const [openId, setOpenId] = useState<string | null>(null);
 *   <DetailDrawer open={!!openId} onClose={() => setOpenId(null)} title="Dettaglio">
 *     contenuto specifico per openId
 *   </DetailDrawer>
 */

const SPRING = { type: "spring" as const, damping: 28, stiffness: 240, mass: 0.9 };

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  // ESC per chiudere
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30"
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            initial={{ x: width + 40 }}
            animate={{ x: 0 }}
            exit={{ x: width + 40 }}
            transition={SPRING}
            style={{ width }}
            className="fixed inset-y-0 right-0 z-50 bg-background border-l border-border shadow-2xl flex flex-col"
          >
            <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0 flex-1">
                {title && (
                  <div className="text-base font-semibold tracking-tight">
                    {title}
                  </div>
                )}
                {subtitle && (
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="p-1.5 -mr-1.5 -mt-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
