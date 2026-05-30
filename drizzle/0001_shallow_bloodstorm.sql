CREATE TYPE "public"."account_type" AS ENUM('bank', 'credit_card', 'wallet', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."category_change_source" AS ENUM('sync', 'inline', 'manual', 'bulk', 'rule-new', 'import');--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"category_id" uuid NOT NULL,
	"movement_type" "movement_type",
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_matched_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "category_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"from_category_id" uuid,
	"from_label" varchar(200) NOT NULL,
	"to_category_id" uuid,
	"to_label" varchar(200) NOT NULL,
	"source" "category_change_source" NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"changed_by_id" text
);
--> statement-breakpoint
CREATE TABLE "counterparty_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_key" varchar(255) NOT NULL,
	"alias_pattern" varchar(200) NOT NULL,
	"boost" integer DEFAULT 30 NOT NULL,
	"source" varchar(16) DEFAULT 'auto' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"color" varchar(7) DEFAULT '#6b7280',
	"identifier" varchar(30),
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"target_account_id" uuid NOT NULL,
	"source_account_id" uuid,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_matched_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "invoice_movements" ADD COLUMN "approval_status" varchar(20) DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_iban" varchar(34);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "document_type" varchar(4);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_method" varchar(4);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "is_credit_note" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "related_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "file_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "extraction_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "is_transfer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "transfer_to_account_id" uuid;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "match_unavailable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_change_log" ADD CONSTRAINT "category_change_log_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_change_log" ADD CONSTRAINT "category_change_log_from_category_id_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_change_log" ADD CONSTRAINT "category_change_log_to_category_id_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_change_log" ADD CONSTRAINT "category_change_log_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_rules" ADD CONSTRAINT "transfer_rules_target_account_id_financial_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_rules" ADD CONSTRAINT "transfer_rules_source_account_id_financial_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorization_rules_category_idx" ON "categorization_rules" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "categorization_rules_pattern_idx" ON "categorization_rules" USING btree ("pattern");--> statement-breakpoint
CREATE INDEX "category_change_log_changed_at_idx" ON "category_change_log" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "category_change_log_movement_idx" ON "category_change_log" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "category_change_log_pair_idx" ON "category_change_log" USING btree ("from_label","to_label");--> statement-breakpoint
CREATE INDEX "counterparty_aliases_key_idx" ON "counterparty_aliases" USING btree ("counterparty_key");--> statement-breakpoint
CREATE UNIQUE INDEX "counterparty_aliases_uniq" ON "counterparty_aliases" USING btree ("counterparty_key","alias_pattern");--> statement-breakpoint
CREATE INDEX "financial_accounts_type_idx" ON "financial_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "financial_accounts_active_idx" ON "financial_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "transfer_rules_target_idx" ON "transfer_rules" USING btree ("target_account_id");--> statement-breakpoint
CREATE INDEX "transfer_rules_source_idx" ON "transfer_rules" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "transfer_rules_pattern_idx" ON "transfer_rules" USING btree ("pattern");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_transfer_to_account_id_financial_accounts_id_fk" FOREIGN KEY ("transfer_to_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_movements_approval_idx" ON "invoice_movements" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "invoices_file_hash_idx" ON "invoices" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "movements_account_idx" ON "movements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "movements_transfer_idx" ON "movements" USING btree ("is_transfer");--> statement-breakpoint
CREATE INDEX "movements_unavailable_idx" ON "movements" USING btree ("match_unavailable");