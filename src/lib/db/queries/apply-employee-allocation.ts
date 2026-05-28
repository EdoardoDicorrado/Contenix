import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, movements } from "@/lib/db/schema";
import { normalizeName } from "@/lib/text-fingerprint";

export type ApplyEmployeeOptions = {
  /**
   * Se true, riassegna anche i movimenti già allocati a un dipendente
   * (utile se vuoi rifare il match dopo aver corretto un nome).
   */
  overrideExisting: boolean;
  /** Se true, considera anche dipendenti non attivi. Default: solo attivi. */
  includeInactive?: boolean;
};

export type EmployeeAllocationExample = {
  id: string;
  description: string;
  amount: string;
  date: Date;
};

export type EmployeeAllocationGroup = {
  employeeId: string;
  employeeName: string; // "Cognome Nome"
  count: number;
  totalAmount: number;
  examples: EmployeeAllocationExample[];
};

export type ApplyEmployeeResult = {
  totalScanned: number;
  allocated: number;
  unchanged: number;
  groups: EmployeeAllocationGroup[];
};

/**
 * Verifica se la descrizione contiene nome+cognome del dipendente
 * in entrambe le forme: "nome cognome" oppure "cognome nome".
 * Richiede ENTRAMBI i token presenti per evitare falsi positivi.
 */
function matchesEmployee(
  descNorm: string,
  firstNorm: string,
  lastNorm: string,
): boolean {
  if (!firstNorm || !lastNorm) return false;
  if (firstNorm.length < 2 || lastNorm.length < 2) return false;
  // Cerca i nomi come token (con bordi spazio o inizio/fine)
  // Usiamo .includes() perché le descrizioni hanno punteggiatura complessa
  // ma richiediamo che entrambi siano presenti.
  return (
    descNorm.includes(firstNorm) &&
    descNorm.includes(lastNorm) &&
    descNorm.indexOf(firstNorm) !== descNorm.indexOf(lastNorm)
  );
}

/**
 * Alloca movimenti ai dipendenti basandosi sul match nome+cognome nella
 * descrizione. Idempotente (riapplicare non duplica nulla).
 *
 * Nota: i trasferimenti vengono ESCLUSI perché concettualmente non sono
 * pagamenti riconducibili a un dipendente.
 */
export async function applyEmployeeAllocation(
  options: ApplyEmployeeOptions,
): Promise<ApplyEmployeeResult> {
  return db.transaction(async (tx) => {
    // (1) Carica dipendenti
    const empConds = [];
    if (!options.includeInactive) empConds.push(eq(employees.active, true));
    const emps = await tx
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(employees)
      .where(empConds.length ? and(...empConds) : undefined);

    if (emps.length === 0) {
      return { totalScanned: 0, allocated: 0, unchanged: 0, groups: [] };
    }

    const empNormalized = emps.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      firstNorm: normalizeName(e.firstName),
      lastNorm: normalizeName(e.lastName),
      fullName: `${e.lastName} ${e.firstName}`,
    }));

    // (2) Carica movimenti candidati (esclusi trasferimenti)
    const candidates = options.overrideExisting
      ? await tx
          .select({
            id: movements.id,
            description: movements.description,
            amount: movements.amount,
            date: movements.date,
            currentEmployeeId: movements.employeeId,
          })
          .from(movements)
          .where(eq(movements.isTransfer, false))
      : await tx
          .select({
            id: movements.id,
            description: movements.description,
            amount: movements.amount,
            date: movements.date,
            currentEmployeeId: movements.employeeId,
          })
          .from(movements)
          .where(and(isNull(movements.employeeId), eq(movements.isTransfer, false)));

    let allocated = 0;
    let unchanged = 0;
    const buckets = new Map<string, string[]>(); // employeeId → movementIds
    const groupsMeta = new Map<
      string,
      {
        name: string;
        count: number;
        totalAmount: number;
        examples: EmployeeAllocationExample[];
      }
    >();

    for (const m of candidates) {
      const descNorm = normalizeName(m.description);
      let matched: (typeof empNormalized)[number] | null = null;
      for (const e of empNormalized) {
        if (matchesEmployee(descNorm, e.firstNorm, e.lastNorm)) {
          matched = e;
          break; // prima match vince
        }
      }
      if (!matched) {
        unchanged += 1;
        continue;
      }
      if (matched.id === m.currentEmployeeId) {
        unchanged += 1;
        continue;
      }
      // Registra cambio
      if (!buckets.has(matched.id)) buckets.set(matched.id, []);
      buckets.get(matched.id)!.push(m.id);

      if (!groupsMeta.has(matched.id)) {
        groupsMeta.set(matched.id, {
          name: matched.fullName,
          count: 0,
          totalAmount: 0,
          examples: [],
        });
      }
      const meta = groupsMeta.get(matched.id)!;
      meta.count += 1;
      meta.totalAmount += parseFloat(m.amount);
      if (meta.examples.length < 5) {
        meta.examples.push({
          id: m.id,
          description: m.description,
          amount: m.amount,
          date: m.date,
        });
      }
      allocated += 1;
    }

    // (3) Update bulk
    for (const [employeeId, ids] of buckets) {
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await tx
          .update(movements)
          .set({ employeeId, updatedAt: new Date() })
          .where(inArray(movements.id, ids.slice(i, i + CHUNK)));
      }
    }

    const groups: EmployeeAllocationGroup[] = Array.from(groupsMeta.entries())
      .map(([employeeId, meta]) => ({
        employeeId,
        employeeName: meta.name,
        count: meta.count,
        totalAmount: meta.totalAmount,
        examples: meta.examples,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalScanned: candidates.length,
      allocated,
      unchanged,
      groups,
    };
  });
}

/**
 * Statistiche live per la UI: quanti movimenti hanno un dipendente, quanti no.
 */
export async function getEmployeeAllocationStats() {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      allocated: sql<number>`COUNT(*) FILTER (WHERE ${movements.employeeId} IS NOT NULL AND ${movements.isTransfer} = false)::int`,
      unallocated: sql<number>`COUNT(*) FILTER (WHERE ${movements.employeeId} IS NULL AND ${movements.isTransfer} = false)::int`,
    })
    .from(movements);

  // Conta anche per dipendente: somma per impiegato
  const perEmp = await db
    .select({
      employeeId: movements.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${movements.amount}), 0)`,
    })
    .from(movements)
    .leftJoin(employees, eq(movements.employeeId, employees.id))
    .where(sql`${movements.employeeId} IS NOT NULL AND ${movements.isTransfer} = false`)
    .groupBy(movements.employeeId, employees.firstName, employees.lastName);

  return {
    total: row?.total ?? 0,
    allocated: row?.allocated ?? 0,
    unallocated: row?.unallocated ?? 0,
    perEmployee: perEmp.map((p) => ({
      employeeId: p.employeeId,
      name: p.firstName && p.lastName ? `${p.lastName} ${p.firstName}` : "(eliminato)",
      count: p.count,
      total: parseFloat(p.total),
    })),
  };
}
