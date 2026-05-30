"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  Users,
  Tags,
  Upload,
  Settings,
  Download,
  Wallet,
  History,
  ListFilter,
  AlertCircle,
  CheckCircle2,
  Globe,
  FilePlus2,
  Wand2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RailSearch, RailUser } from "./rail-actions";
import { RailNotification } from "./rail-notification";

/**
 * Sidebar a doppia colonna stile Linear con animazione spring:
 *  - Rail (sx, 56px): icone + tooltip al hover. z-index alto e sfondo
 *    opaco, così il panel può scivolare "da dietro" la rail.
 *  - Panel (224px): sotto-pagine della sezione corrente. Width+translateX
 *    animati insieme via framer-motion (AnimatePresence). Spring naturale.
 *  - Sezioni atomiche: panel completamente assente (no spazio occupato).
 *  - Tools in fondo al rail.
 */

type SubItem = { label: string; href: string; icon: LucideIcon };
type SectionItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: SubItem[];
};

const sections: SectionItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Conti", href: "/conti", icon: Wallet },
  {
    label: "Movimenti",
    href: "/movimenti",
    icon: ArrowLeftRight,
    children: [
      { label: "Tutti", href: "/movimenti", icon: ArrowLeftRight },
      { label: "Da rivedere", href: "/movimenti/da-rivedere", icon: AlertCircle },
    ],
  },
  {
    label: "Fatture",
    href: "/fatture",
    icon: FileText,
    children: [
      { label: "Tutte", href: "/fatture", icon: FileText },
      { label: "Da rivedere", href: "/fatture/da-rivedere", icon: AlertCircle },
      { label: "In approvazione", href: "/fatture/in-approvazione", icon: CheckCircle2 },
      { label: "Estere", href: "/fatture/estere", icon: Globe },
      { label: "Carica", href: "/fatture/carica", icon: FilePlus2 },
    ],
  },
  { label: "Dipendenti", href: "/dipendenti", icon: Users },
  { label: "Categorie", href: "/categorie", icon: Tags },
  { label: "Regole", href: "/regole", icon: ListFilter },
  { label: "Sincronizza", href: "/sincronizza", icon: Wand2 },
];

const tools: SectionItem[] = [
  { label: "Importa movimenti", href: "/importa", icon: Upload },
  { label: "Importa via AI", href: "/importa-ai", icon: Sparkles },
  { label: "Importa storico", href: "/importa-storico", icon: History },
  { label: "Esportazioni", href: "/esportazioni", icon: Download },
  { label: "Storico cambiamenti", href: "/storico-cambiamenti", icon: History },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings },
];

const PANEL_WIDTH = 240; // più compatto; tipo Linear (15rem)

// Spring: rapido ma morbido. damping basso → leggero overshoot.
const SPRING = { type: "spring" as const, damping: 26, stiffness: 220, mass: 0.9 };

export function Sidebar() {
  const pathname = usePathname();
  const allItems = [...sections, ...tools];
  const current =
    allItems
      .filter((s) => isOnSection(pathname, s.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? sections[0];
  const panelChildren = sections.find((s) => s.href === current.href)?.children;
  const showPanel = !!panelChildren && panelChildren.length > 0;

  return (
    <aside className="hidden md:flex shrink-0 border-r border-border bg-background sticky top-0 h-screen">
      {/* RAIL — z alto + bg opaco: copre il panel che scorre da dietro.
          Scala su lg+: laptop piccolo più compatto, desktop più ampio. */}
      <div className="relative z-20 w-14 lg:w-16 h-full flex flex-col items-center py-3 lg:py-4 gap-1 lg:gap-1.5 border-r border-border bg-background">
        {sections.map((s) => (
          <RailIcon key={s.href} item={s} active={current.href === s.href} />
        ))}
        <div className="my-2 w-8 border-t border-border" />
        {tools.map((s) => (
          <RailIcon key={s.href} item={s} active={current.href === s.href} />
        ))}
        {/* Spaziatore: spinge le azioni utente in fondo */}
        <div className="flex-1" />
        <div className="w-8 border-t border-border" />
        <RailSearch />
        <RailNotification />
        <RailUser />
      </div>

      {/* PANEL — width animata insieme alla translateX del contenuto.
          AnimatePresence gestisce mount/unmount con stesso spring. */}
      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            key="sidebar-panel"
            initial={{ width: 0 }}
            animate={{ width: PANEL_WIDTH }}
            exit={{ width: 0 }}
            transition={SPRING}
            className="relative z-10 overflow-hidden"
          >
            <motion.div
              initial={{ x: -PANEL_WIDTH }}
              animate={{ x: 0 }}
              exit={{ x: -PANEL_WIDTH }}
              transition={SPRING}
              className="absolute inset-y-0 left-0 flex flex-col py-5 px-3 bg-background"
              style={{ width: PANEL_WIDTH }}
            >
              <PanelContent
                key={current.href}
                section={
                  panelChildren
                    ? { label: current.label, children: panelChildren }
                    : null
                }
                pathname={pathname}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function PanelContent({
  section,
  pathname,
}: {
  section: { label: string; children: SubItem[] } | null;
  pathname: string;
}) {
  if (!section) return null;
  return (
    <>
      <div className="px-3 pb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {section.label}
      </div>
      <nav className="flex flex-col gap-0.5">
        {section.children.map((c) => (
          <PanelLink key={c.href} item={c} pathname={pathname} />
        ))}
      </nav>
    </>
  );
}

function RailIcon({ item, active }: { item: SectionItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "group relative h-10 w-10 lg:h-12 lg:w-12 inline-flex items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-foreground"
        />
      )}
      {/* Tooltip al hover */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        {item.label}
      </span>
    </Link>
  );
}

function PanelLink({ item, pathname }: { item: SubItem; pathname: string }) {
  const active = pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 lg:gap-3 px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-md text-xs lg:text-sm transition-colors",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isOnSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
