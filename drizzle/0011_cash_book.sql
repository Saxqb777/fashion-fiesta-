CREATE TYPE "public"."cash_kind" AS ENUM('opening', 'customer_payment', 'quick_sale', 'supplier_payment', 'expense', 'salary', 'advance', 'embroidery', 'transfer', 'close_difference');--> statement-breakpoint
CREATE TYPE "public"."cash_pot" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."embroidery_side" AS ENUM('shop', 'operator');--> statement-breakpoint
CREATE TYPE "public"."embroidery_status" AS ENUM('to_do', 'done');--> statement-breakpoint
CREATE TYPE "public"."settlement_direction" AS ENUM('to_operator', 'from_operator');--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'pos_sale';--> statement-breakpoint
CREATE TABLE "cash_book" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"entry_date" date NOT NULL,
	"pot" "cash_pot" NOT NULL,
	"kind" "cash_kind" NOT NULL,
	"amount_fils" integer NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"close_date" date NOT NULL,
	"expected_cash_fils" integer NOT NULL,
	"counted_cash_fils" integer NOT NULL,
	"difference_fils" integer NOT NULL,
	"card_total_fils" integer NOT NULL,
	"notes" text,
	CONSTRAINT "daily_closes_close_date_unique" UNIQUE("close_date")
);
--> statement-breakpoint
CREATE TABLE "embroidery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"job_date" date NOT NULL,
	"side" "embroidery_side" NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"customer_name" text,
	"description" text NOT NULL,
	"pieces" integer DEFAULT 1 NOT NULL,
	"price_fils" integer NOT NULL,
	"shop_share_percent" integer NOT NULL,
	"status" "embroidery_status" DEFAULT 'to_do' NOT NULL,
	"done_at" timestamp with time zone,
	"design_file_url" text,
	"design_file_name" text,
	"thread_colours" text,
	"design_size" text,
	"placement" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"expense_date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"payee" text,
	"payee_trn" text,
	"amount_fils" integer NOT NULL,
	"vat_fils" integer DEFAULT 0 NOT NULL,
	"pot" "cash_pot" NOT NULL,
	"receipt_url" text,
	"notes" text,
	"source_type" text,
	"source_id" uuid
);
--> statement-breakpoint
CREATE TABLE "operator_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"settle_date" date NOT NULL,
	"direction" "settlement_direction" NOT NULL,
	"amount_fils" integer NOT NULL,
	"pot" "cash_pot" NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "pos_sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sale_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_fils" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"number" text NOT NULL,
	"sale_date" date NOT NULL,
	"sold_by" uuid NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"method" "payment_method" NOT NULL,
	"subtotal_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL,
	"total_fils" integer NOT NULL,
	"notes" text,
	CONSTRAINT "pos_sales_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "salary_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"advance_date" date NOT NULL,
	"amount_fils" integer NOT NULL,
	"pot" "cash_pot" NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"pay_date" date NOT NULL,
	"gross_fils" integer NOT NULL,
	"advances_deducted_fils" integer DEFAULT 0 NOT NULL,
	"net_fils" integer NOT NULL,
	"pot" "cash_pot" NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "salary_fils" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pay_day" integer;--> statement-breakpoint
ALTER TABLE "embroidery_jobs" ADD CONSTRAINT "embroidery_jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embroidery_jobs" ADD CONSTRAINT "embroidery_jobs_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_book_date_idx" ON "cash_book" USING btree ("entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_book_source_unique" ON "cash_book" USING btree ("source_type","source_id","pot");--> statement-breakpoint
CREATE INDEX "embroidery_jobs_customer_idx" ON "embroidery_jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "pos_sale_lines_sale_idx" ON "pos_sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pos_sales_date_idx" ON "pos_sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "salary_advances_user_idx" ON "salary_advances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_payments_user_month" ON "salary_payments" USING btree ("user_id","month");--> statement-breakpoint
-- Money already recorded goes into the cash book. Cash to the drawer, everything else to the bank.
INSERT INTO "cash_book" ("entry_date", "pot", "kind", "amount_fils", "description", "source_type", "source_id", "created_by")
SELECT "payment_date", CASE WHEN "method" = 'cash' THEN 'cash'::cash_pot ELSE 'bank'::cash_pot END, 'customer_payment', "amount_fils", 'Receipt ' || "number", 'payment', "id", "created_by" FROM "payments";
--> statement-breakpoint
INSERT INTO "cash_book" ("entry_date", "pot", "kind", "amount_fils", "description", "source_type", "source_id", "created_by")
SELECT sp."payment_date", CASE WHEN sp."method" = 'cash' THEN 'cash'::cash_pot ELSE 'bank'::cash_pot END, 'supplier_payment', -sp."amount_fils", 'Paid ' || s."name", 'supplier_payment', sp."id", sp."created_by"
FROM "supplier_payments" sp JOIN "suppliers" s ON s."id" = sp."supplier_id";
--> statement-breakpoint
INSERT INTO "cash_book" ("entry_date", "pot", "kind", "amount_fils", "description", "source_type", "source_id")
SELECT coalesce("opening_date", current_date), 'cash', 'opening', "opening_cash_fils", 'Cash in hand on the go live day', 'opening', "id" FROM "settings" WHERE "opening_cash_fils" <> 0;
--> statement-breakpoint
INSERT INTO "expense_categories" ("name") VALUES ('Rent'), ('Electricity and water'), ('Transport'), ('Salaries'), ('Shop supplies'), ('Repairs'), ('Phone and internet'), ('Other');
--> statement-breakpoint
-- Every series starts at 1001. Only series that have not issued anything move.
UPDATE "number_sequences" SET "next_number" = 1001 WHERE "next_number" = 1;
