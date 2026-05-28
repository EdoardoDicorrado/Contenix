import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listUncategorizedMovements } from "@/lib/db/queries/movements";
import { listCategories } from "@/lib/db/queries/categories";
import { DaRivedereClient } from "./da-rivedere-client";

// Stesso set di noise di storico-analyzer / movement-grouping
const NOISE = new Set([
  "bonifico", "pagamento", "incasso", "addebito", "accredito", "versamento",
  "sepa", "fatt", "fattura", "del", "al", "da", "in", "per", "via", "c/o",
  "spese", "commissioni", "sdd", "carta", "estratto", "conto", "saldo",
  "rid", "nr", "ord", "ben", "beneficiario", "ordinante", "rif",
  "cro", "iur", "trn", "cod", "codice", "data", "valuta", "dare",
  "avere", "uscita", "entrata", "movimento", "credito", "debito", "cliente",
  "fornitore", "italia", "italy", "spa", "srl", "sas", "snc",
  "dt", "acq", "pos", "merchant", "voi", "vostro", "favore", "disposto",
  "istantaneo", "europea", "europe", "limited",
  "effettuato", "ore", "mediante", "presso", "ctv", "usd", "eur", "cambio",
  "commissione", "conversione", "valutaria", "applicata", "operazione",
  "autorizzazione", "ora", "alle", "intern", "inter", "notprovided", "cash",
]);

function fingerprint(text: string, maxTokens: number = 2): string {
  if (!text) return "";
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s./@-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(/[\s./]+/)
    .filter((t) => {
      if (t.length < 3) return false;
      if (/^\d+$/.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (/^x+$/.test(t)) return false;
      if (NOISE.has(t)) return false;
      return true;
    });
  return tokens.slice(0, maxTokens).join(" ");
}

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
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
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
          <CheckCircle2 className="h-10 w-10 text-green-600" />
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
