CREATE TYPE "public"."bill_kind" AS ENUM('bill', 'opening_balance');--> statement-breakpoint
CREATE TYPE "public"."po_kind" AS ENUM('fabric', 'outsourcing');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."qty_unit" AS ENUM('m', 'pcs');--> statement-breakpoint
CREATE TYPE "public"."stock_move_kind" AS ENUM('opening', 'received', 'taken', 'sent', 'adjusted');--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"receipt_id" uuid NOT NULL,
	"po_line_id" uuid NOT NULL,
	"qty_centi" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"po_id" uuid NOT NULL,
	"received_date" date NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"po_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"fabric_id" uuid,
	"product_id" uuid,
	"so_line_id" uuid,
	"task_id" uuid,
	"description" text NOT NULL,
	"unit" "qty_unit" DEFAULT 'm' NOT NULL,
	"qty_centi" integer NOT NULL,
	"unit_price_fils" integer DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"number" text,
	"kind" "po_kind" DEFAULT 'fabric' NOT NULL,
	"status" "po_status" DEFAULT 'draft' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"order_id" uuid,
	"po_date" date NOT NULL,
	"expected_date" date,
	"notes" text,
	"subtotal_fils" integer DEFAULT 0 NOT NULL,
	"vat_fils" integer DEFAULT 0 NOT NULL,
	"total_fils" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "purchase_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"fabric_id" uuid NOT NULL,
	"kind" "stock_move_kind" NOT NULL,
	"qty_centi" integer NOT NULL,
	"moved_on" date NOT NULL,
	"receipt_id" uuid,
	"task_id" uuid,
	"po_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"bill_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"po_line_id" uuid,
	"description" text NOT NULL,
	"unit" "qty_unit" DEFAULT 'pcs' NOT NULL,
	"qty_centi" integer NOT NULL,
	"unit_price_fils" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"kind" "bill_kind" DEFAULT 'bill' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"po_id" uuid,
	"bill_number" text,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"supplier_trn" text,
	"notes" text,
	"file_url" text,
	"subtotal_fils" integer DEFAULT 0 NOT NULL,
	"vat_fils" integer DEFAULT 0 NOT NULL,
	"total_fils" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"payment_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount_fils" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"supplier_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount_fils" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_limit_fils" integer;--> statement-breakpoint
ALTER TABLE "fabrics" ADD COLUMN "low_stock_centi" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "metres_per_piece_centi" integer;--> statement-breakpoint
ALTER TABLE "so_lines" ADD COLUMN "metres_per_piece_centi" integer;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_so_line_id_so_lines_id_fk" FOREIGN KEY ("so_line_id") REFERENCES "public"."so_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "goods_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_po_line_idx" ON "goods_receipt_lines" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX "receipts_po_idx" ON "goods_receipts" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "po_lines_po_idx" ON "po_lines" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "po_lines_task_idx" ON "po_lines" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_order_idx" ON "purchase_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_fabric_idx" ON "stock_movements" USING btree ("fabric_id");--> statement-breakpoint
CREATE INDEX "stock_task_idx" ON "stock_movements" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "stock_po_idx" ON "stock_movements" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "bill_lines_bill_idx" ON "supplier_bill_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_lines_po_line_idx" ON "supplier_bill_lines" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX "bills_supplier_idx" ON "supplier_bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "bills_po_idx" ON "supplier_bills" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "bills_due_idx" ON "supplier_bills" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "supplier_alloc_payment_idx" ON "supplier_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "supplier_alloc_bill_idx" ON "supplier_payment_allocations" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
-- Supplier opening balances from Phase 3 become their first bill, so Who you owe and payments work on them.
INSERT INTO "supplier_bills" ("kind", "supplier_id", "bill_date", "due_date", "notes", "subtotal_fils", "vat_fils", "total_fils")
SELECT 'opening_balance', "id", COALESCE("opening_balance_date", CURRENT_DATE), COALESCE("opening_balance_date", CURRENT_DATE) + COALESCE("payment_days", 0), 'Opening balance', "opening_balance_fils", 0, "opening_balance_fils"
FROM "suppliers" WHERE "opening_balance_fils" > 0;
