import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  varchar,
  pgEnum,
  integer,
  primaryKey,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ============================================================
// AUTH.JS REQUIRED TABLES
// ============================================================

export const userRoleEnum = pgEnum("user_role", ["admin", "viewer"]);

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("admin"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ============================================================
// BUSINESS DOMAIN
// ============================================================

export const movementTypeEnum = pgEnum("movement_type", ["income", "expense"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["purchase", "sale"]);
export const accountTypeEnum = pgEnum("account_type", [
  "bank",         // conto bancario principale
  "credit_card",  // carta di credito
  "wallet",       // Revolut, PayPal, Stripe Balance, ecc.
  "cash",         // contanti
  "other",        // altri tipi
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
]);

// Conti: ogni "spazio finanziario" separato. Il conto principale è la banca,
// gli altri sono conti secondari (carta credito, Revolut, contanti, ecc.).
// Movimenti tra conto principale ↔ conto secondario sono trasferimenti
// (NON spese), e non entrano nel P&L Economic.
export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    color: varchar("color", { length: 7 }).default("#6b7280"),
    // ultime 4 cifre carta / IBAN parziale, opzionale - per UI
    identifier: varchar("identifier", { length: 30 }),
    // Saldo iniziale dichiarato dall'utente (per dashboard saldo corrente)
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    isPrimary: boolean("is_primary").notNull().default(false), // un solo conto principale
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("financial_accounts_type_idx").on(t.type),
    index("financial_accounts_active_idx").on(t.isActive),
  ],
);

// Dipendenti tracciati (anagrafica, costo, ricavi che portano)
export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  fiscalCode: varchar("fiscal_code", { length: 16 }),
  role: varchar("role", { length: 100 }),
  hiredAt: timestamp("hired_at", { mode: "date" }),
  monthlyCost: numeric("monthly_cost", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Categorie per i movimenti (es. Materie prime, Stipendi, Vendita prodotto X)
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: movementTypeEnum("type").notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Regole di riconoscimento trasferimenti: se la descrizione del movimento
// contiene il `pattern`, viene marcato come trasferimento verso `targetAccountId`.
// I trasferimenti NON entrano nel P&L Economic (sono solo movimentazione di
// liquidità tra conti dell'utente).
// Esempio: "ESTRATTO CONTO AMEX" → trasferimento verso conto carta credito.
export const transferRules = pgTable(
  "transfer_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pattern: varchar("pattern", { length: 200 }).notNull(),
    // Conto di destinazione del trasferimento (es. carta di credito)
    targetAccountId: uuid("target_account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    // Opzionale: applica la regola solo a movimenti di questo conto sorgente
    // (es. solo movimenti del conto bancario principale). Null = applica a tutti.
    sourceAccountId: uuid("source_account_id").references(
      () => financialAccounts.id,
      { onDelete: "cascade" },
    ),
    matchCount: integer("match_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastMatchedAt: timestamp("last_matched_at"),
  },
  (t) => [
    index("transfer_rules_target_idx").on(t.targetAccountId),
    index("transfer_rules_source_idx").on(t.sourceAccountId),
    index("transfer_rules_pattern_idx").on(t.pattern),
  ],
);

// Regole di auto-categorizzazione: se la descrizione del movimento contiene
// il `pattern`, viene assegnata automaticamente la `categoryId`.
// Le regole vengono create dall'utente (esplicitamente o tramite form-helper).
export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pattern: varchar("pattern", { length: 200 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    movementType: movementTypeEnum("movement_type"), // null = applica a entrambi
    matchCount: integer("match_count").notNull().default(0), // statistiche uso
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastMatchedAt: timestamp("last_matched_at"),
  },
  (t) => [
    index("categorization_rules_category_idx").on(t.categoryId),
    index("categorization_rules_pattern_idx").on(t.pattern),
  ],
);

// Movimenti contabili (entrate/uscite)
export const movements = pgTable(
  "movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Conto a cui appartiene il movimento. Nullable per dati legacy pre-F1,
    // sarà reso NOT NULL dopo migrazione dei dati esistenti.
    accountId: uuid("account_id").references(() => financialAccounts.id, {
      onDelete: "restrict", // mai cancellare un conto che ha movimenti
    }),
    date: timestamp("date", { mode: "date" }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    type: movementTypeEnum("type").notNull(),
    description: text("description").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    employeeId: uuid("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    // Se true, il movimento è un trasferimento tra conti (es. addebito carta sul
    // conto banca) e NON va incluso nel P&L Economic. Le spese vere sono nei
    // movimenti del conto secondario di destinazione.
    isTransfer: boolean("is_transfer").notNull().default(false),
    // Quando isTransfer=true, link al conto secondario coinvolto nel trasferimento
    transferToAccountId: uuid("transfer_to_account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("movements_date_idx").on(t.date),
    index("movements_employee_idx").on(t.employeeId),
    index("movements_category_idx").on(t.categoryId),
    index("movements_account_idx").on(t.accountId),
    index("movements_transfer_idx").on(t.isTransfer),
  ],
);

// Fatture (acquisto/vendita)
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 50 }).notNull(),
    type: invoiceTypeEnum("type").notNull(),
    counterpartyName: varchar("counterparty_name", { length: 255 }).notNull(),
    counterpartyVat: varchar("counterparty_vat", { length: 20 }),
    issueDate: timestamp("issue_date", { mode: "date" }).notNull(),
    dueDate: timestamp("due_date", { mode: "date" }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    description: text("description"),
    paymentIban: varchar("payment_iban", { length: 34 }),
    documentType: varchar("document_type", { length: 4 }),
    paymentMethod: varchar("payment_method", { length: 4 }),
    isCreditNote: boolean("is_credit_note").notNull().default(false),
    relatedInvoiceId: uuid("related_invoice_id"),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    fileHash: text("file_hash"),
    fileSize: integer("file_size"),
    fileMime: varchar("file_mime", { length: 100 }),
    parsedData: jsonb("parsed_data"),
    extractionStatus: varchar("extraction_status", { length: 20 })
      .notNull()
      .default("none"),
    uploadedById: text("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("invoices_issue_date_idx").on(t.issueDate),
    index("invoices_status_idx").on(t.status),
    index("invoices_counterparty_idx").on(t.counterpartyName),
    index("invoices_file_hash_idx").on(t.fileHash),
  ],
);

// Log dei cambi di categoria (o transfer) sui movimenti.
// Tracciamo sia il "label" (snapshot stringa, sopravvive a cancellazioni/rinomine)
// sia gli id come FK SET NULL per linking se la categoria esiste ancora.
// `source` indica chi/cosa ha fatto il cambio:
//   - "sync"      → applyRulesToMovements (sincronizzazione globale)
//   - "inline"    → inline edit nella tabella movimenti
//   - "manual"    → form modifica movimento
//   - "bulk"      → bulk categorize dalla pagina "Da rivedere"
//   - "rule-new"  → "Crea regola e applica" dalla pagina "Da rivedere"
//   - "import"    → import storico / import AI
export const categoryChangeSourceEnum = pgEnum("category_change_source", [
  "sync",
  "inline",
  "manual",
  "bulk",
  "rule-new",
  "import",
]);

export const categoryChangeLog = pgTable(
  "category_change_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    movementId: uuid("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    fromCategoryId: uuid("from_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    fromLabel: varchar("from_label", { length: 200 }).notNull(),
    toCategoryId: uuid("to_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    toLabel: varchar("to_label", { length: 200 }).notNull(),
    source: categoryChangeSourceEnum("source").notNull(),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
    changedById: text("changed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("category_change_log_changed_at_idx").on(t.changedAt),
    index("category_change_log_movement_idx").on(t.movementId),
    index("category_change_log_pair_idx").on(t.fromLabel, t.toLabel),
  ],
);

// Match many-to-many tra fatture e movimenti
export const invoiceMovements = pgTable(
  "invoice_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    movementId: uuid("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    matchedAmount: numeric("matched_amount", { precision: 14, scale: 2 }).notNull(),
    matchType: varchar("match_type", { length: 20 }).notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("invoice_movements_invoice_idx").on(t.invoiceId),
    index("invoice_movements_movement_idx").on(t.movementId),
  ],
);

// ============================================================
// RELATIONS
// ============================================================

export const employeesRelations = relations(employees, ({ many }) => ({
  movements: many(movements),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  movements: many(movements),
}));

export const movementsRelations = relations(movements, ({ one, many }) => ({
  category: one(categories, {
    fields: [movements.categoryId],
    references: [categories.id],
  }),
  employee: one(employees, {
    fields: [movements.employeeId],
    references: [employees.id],
  }),
  createdBy: one(users, {
    fields: [movements.createdById],
    references: [users.id],
  }),
  invoiceLinks: many(invoiceMovements),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  uploadedBy: one(users, {
    fields: [invoices.uploadedById],
    references: [users.id],
  }),
  movementLinks: many(invoiceMovements),
}));

export const invoiceMovementsRelations = relations(invoiceMovements, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceMovements.invoiceId],
    references: [invoices.id],
  }),
  movement: one(movements, {
    fields: [invoiceMovements.movementId],
    references: [movements.id],
  }),
}));
