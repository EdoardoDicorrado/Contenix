import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listUncategorizedMovements } from "@/lib/db/queries/movements";
import { listCategories } from "@/lib/db/queries/categories";
import { fingerprint } from "@/lib/text-fingerprint";
import { DaRivedereClient } from "./da-rivedere-client";

export type UnmatchedRow = {
  id: string;
  date: string; // ISO
  amount: number;
  type: "income" | "expense";
  description: string;
  accountName: string | null;
  accountColor: string | null;
};

export type Cluster = {
  pattern: string;
  rows: UnmatchedRow[];
  totalAmount: number;
  type: "income" | "expense" | "mixed";
};

export default async function DaRivederePage() {
  const [rawRows, categories] = await Promise.all([
    listUncategorizedMovements(),
    listCategories(),
  ]);

  // Converti in shape client + raggruppa per fingerprint
  const allRows: UnmatchedRow[] = rawRows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    amount: parseFloat(r.amount),
    type: r.type,
    description: r.description,
    accountName: r.accountName ?? null,
    accountColor: r.accountColor ?? null,
  }));

  const map = new Map<string, UnmatchedRow[]>();
  const singletons: UnmatchedRow[] = [];

  for (const r of allRows) {
    const fp = fingerprint(r.description);
    if (!fp) {
      singletons.push(r);
      continue;
    }
    if (!map.has(fp)) map.set(fp, []);
    map.get(fp)!.push(r);
  }

  const clusters: Cluster[] = [];
  for (const [pattern, rows] of map) {
    if (rows.length < 2) {
      singletons.push(...rows);
      continue;
    }
    const incomes = rows.filter((r) => r.type === "income");
    const expenses = rows.filter((r) => r.type === "expense");
    const type: Cluster["type"] =
      incomes.length === 0 ? "expense" : expenses.length === 0 ? "income" : "mixed";
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    clusters.push({ pattern, rows, totalAmount, type });
  }
  clusters.sort((a, b) => b.rows.length - a.rows.length);
  singletons.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/movimenti"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Movimenti
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">Movimenti da rivedere</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {allRows.length === 0
            ? "Tutti i movimenti sono categorizzati. Ben fatto."
            : `${allRows.length} movimenti senza categoria, raggruppati per pattern simile. Categorizza in bulk o crea una regola che si applichi automaticamente anche ai prossimi import.`}
        </p>
      </div>

      {allRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-12 flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <div className="text-center">
            <div className="font-medium">Nessun movimento da rivedere</div>
            <div className="text-sm text-muted-foreground mt-1">
              Tutti i tuoi movimenti hanno una categoria o sono marcati come trasferimento.
            </div>
          </div>
          <Link href="/movimenti">
            <Button>Vai ai movimenti</Button>
          </Link>
        </div>
      ) : (
        <DaRivedereClient
          clusters={clusters}
          singletons={singletons}
          categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color }))}
        />
      )}
    </div>
  );
}
