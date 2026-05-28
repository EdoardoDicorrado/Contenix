import Link from "next/link";
import {
  Wallet,
  FileText,
  Users,
  Store,
  ArrowRight,
  Banknote,
  CreditCard,
  Coins,
  Box,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  bank: Banknote,
  credit_card: CreditCard,
  wallet: Wallet,
  cash: Coins,
  other: Box,
};

export type AccountItem = {
  id: string;
  name: string;
  type: string;
  color: string | null;
  balance: number;
  isPrimary: boolean;
};

export type InvoicePending = {
  id: string;
  counterpartyName: string;
  totalAmount: number;
  dueDate: Date | null;
  type: "sale" | "purchase";
};

export function DashboardSecondary({
  accounts,
  invoices,
  invoiceCounts,
  employees,
  topVendors,
}: {
  accounts: AccountItem[];
  invoices: InvoicePending[];
  invoiceCounts: { paid: number; pending: number; overdue: number };
  employees: {
    activeCount: number;
    totalCount: number;
    monthlyCost: number;
    totalRevenue: number;
  };
  topVendors: Array<{ pattern: string; total: number; count: number }>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Saldi per conto */}
      <Card
        title="Saldi per conto"
        icon={<Wallet className="h-4 w-4" />}
        href="/conti"
      >
        {accounts.length === 0 ? (
          <Empty text="Nessun conto attivo." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {accounts.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? Box;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-b-0"
                >
                  <Link
                    href={`/conti/${a.id}`}
                    className="flex items-center gap-2 min-w-0 hover:text-primary"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: a.color ?? "#a1a1aa" }}
                    />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">
                      {a.isPrimary ? "★ " : ""}
                      {a.name}
                    </span>
                  </Link>
                  <span
                    className={`text-sm font-medium tabular-nums shrink-0 ${
                      a.balance >= 0 ? "text-foreground" : "text-danger"
                    }`}
                  >
                    {formatCurrency(a.balance)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Fatture */}
      <Card
        title="Fatture"
        icon={<FileText className="h-4 w-4" />}
        href="/fatture"
      >
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat
            label="Pagate"
            value={invoiceCounts.paid}
            accent="success"
          />
          <Stat
            label="In attesa"
            value={invoiceCounts.pending}
            accent="neutral"
          />
          <Stat
            label="Scadute"
            value={invoiceCounts.overdue}
            accent={invoiceCounts.overdue > 0 ? "danger" : "neutral"}
          />
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Nessuna fattura in attesa.
          </p>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Top in attesa
            </div>
            <ul className="flex flex-col gap-1">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 py-1 text-xs"
                >
                  <Link
                    href={`/fatture/${inv.id}`}
                    className="flex items-center gap-1.5 min-w-0 hover:text-primary"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        inv.type === "sale" ? "bg-success" : "bg-danger"
                      }`}
                    />
                    <span className="truncate">{inv.counterpartyName}</span>
                  </Link>
                  <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                    {formatCurrency(inv.totalAmount)}
                    {inv.dueDate && (
                      <span className="ml-1 text-[10px]">
                        ({formatDate(inv.dueDate)})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Dipendenti */}
      <Card
        title="Dipendenti"
        icon={<Users className="h-4 w-4" />}
        href="/dipendenti"
      >
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="Attivi"
            value={employees.activeCount}
            accent="neutral"
            subtitle={
              employees.totalCount > employees.activeCount
                ? `di ${employees.totalCount}`
                : undefined
            }
          />
          <Stat
            label="Costo mese"
            valueText={formatCurrency(employees.monthlyCost)}
            accent="danger"
          />
          <Stat
            label="Ricavi portati"
            valueText={formatCurrency(employees.totalRevenue)}
            accent="success"
          />
        </div>
      </Card>

      {/* Top vendor */}
      <Card
        title="Top fornitori del mese"
        icon={<Store className="h-4 w-4" />}
        href="/movimenti"
      >
        {topVendors.length === 0 ? (
          <Empty text="Nessuna spesa nel mese." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topVendors.map((v, idx) => (
              <li key={v.pattern} className="flex items-center gap-2 text-xs py-0.5">
                <span className="text-muted-foreground tabular-nums w-4 text-right">
                  {idx + 1}.
                </span>
                <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] truncate flex-1">
                  {v.pattern}
                </code>
                <span className="text-muted-foreground">
                  {v.count}×
                </span>
                <span className="text-danger font-medium tabular-nums shrink-0">
                  {formatCurrency(v.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <Link
          href={href}
          className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
        >
          Vedi tutti <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueText,
  accent,
  subtitle,
}: {
  label: string;
  value?: number;
  valueText?: string;
  accent: "success" | "danger" | "neutral";
  subtitle?: string;
}) {
  const accentClass = {
    success: "text-success",
    danger: "text-danger",
    neutral: "text-foreground",
  }[accent];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accentClass}`}>
        {valueText ?? value}
      </div>
      {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-xs text-muted-foreground text-center py-4">{text}</div>
  );
}
