import "server-only";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";

export type EmployeeInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  fiscalCode: string | null;
  role: string | null;
  hiredAt: Date | null;
  monthlyCost: string | null;
  active: boolean;
  notes: string | null;
};

export async function listEmployees(activeOnly = true) {
  return db
    .select()
    .from(employees)
    .where(activeOnly ? eq(employees.active, true) : undefined)
    .orderBy(asc(employees.lastName), asc(employees.firstName));
}

export async function listEmployeesWithStats() {
  return db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      role: employees.role,
      monthlyCost: employees.monthlyCost,
      active: employees.active,
      hiredAt: employees.hiredAt,
      revenue: sql<string>`COALESCE((
        SELECT SUM(amount) FROM movements
        WHERE movements.employee_id = ${employees.id}
          AND movements.type = 'income'
      ), 0)`,
      expense: sql<string>`COALESCE((
        SELECT SUM(amount) FROM movements
        WHERE movements.employee_id = ${employees.id}
          AND movements.type = 'expense'
      ), 0)`,
    })
    .from(employees)
    .orderBy(desc(employees.active), asc(employees.lastName));
}

export async function getEmployee(id: string) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return row ?? null;
}

export async function createEmployee(input: EmployeeInput) {
  const [row] = await db.insert(employees).values(input).returning();
  return row;
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  const [row] = await db
    .update(employees)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();
  return row;
}

export async function deleteEmployee(id: string) {
  await db.delete(employees).where(eq(employees.id, id));
}
