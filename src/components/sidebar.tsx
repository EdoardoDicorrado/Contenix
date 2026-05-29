"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

const nav: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Conti", href: "/conti", icon: Wallet },
  {
    label: "Movimenti",
    href: "/movimenti",
    icon: ArrowLeftRight,
    children: [
      { label: "Da rivedere", href: "/movimenti/da-rivedere", icon: AlertCircle },
    ],
  },
  {
    label: "Fatture",
    href: "/fatture",
    icon: FileText,
    children: [
      { label: "Da rivedere", href: "/fatture/da-rivedere", icon: AlertCircle },
    ],
  },
  { label: "Dipendenti", href: "/dipendenti", icon: Users },
  { label: "Categorie", href: "/categorie", icon: Tags },
  { label: "Regole", href: "/regole", icon: ListFilter },
  { label: "Sincronizza", href: "/sincronizza", icon: Wand2 },
  { label: "Storico cambiamenti", href: "/storico-cambiamenti", icon: History },
];

const secondary = [
  { label: "Importa movimenti", href: "/importa", icon: Upload },
  { label: "Importa fatture", href: "/fatture/carica", icon: FileText },
  { label: "Importa storico", href: "/importa-storico", icon: History },
  { label: "Esportazioni", href: "/esportazioni", icon: Download },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-sm font-semibold tracking-tight">Contabilità</div>
        <div className="text-xs text-muted-foreground mt-0.5">WPaper</div>
      </div>

      <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
        {nav.map((item) => {
          const parentActive = isActive(pathname, item.href);
          const inChild =
            item.children?.some(
              (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
            ) ?? false;
          return (
            <div key={item.href} className="flex flex-col gap-0.5">
              <SidebarLink {...item} active={parentActive && !inChild} />
              {item.children && parentActive && (
                <div className="flex flex-col gap-0.5 ml-4 border-l border-border pl-2">
                  {item.children.map((child) => (
                    <SidebarLink
                      key={child.href}
                      {...child}
                      active={pathname === child.href || pathname.startsWith(child.href + "/")}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-6 mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Strumenti
        </div>
        {secondary.map((item) => (
          <SidebarLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
