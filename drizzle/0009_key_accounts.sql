CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered');--> statement-breakpoint
ALTER TYPE "public"."supplier_type" ADD VALUE 'delivery';--> statement-breakpoint
CREATE TABLE "account_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"customer_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"agreed_price_fils" integer NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "account_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"customer_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" text NOT NULL,
	"role" text,
	"sizes" text,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"customer_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"emirate" text,
	"delivery_supplier_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "piece_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"order_id" uuid NOT NULL,
	"piece_key" text NOT NULL,
	"delivery_note_id" uuid,
	CONSTRAINT "piece_ticks_piece_key_unique" UNIQUE("piece_key")
);
--> statement-breakpoint
CREATE TABLE "so_line_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"so_line_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"branch_id" uuid,
	"staff_id" uuid,
	"person_name" text,
	"size" text,
	"qty" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_branches" ADD COLUMN "emirate" text;--> statement-breakpoint
ALTER TABLE "customer_branches" ADD COLUMN "delivery_instructions" text;--> statement-breakpoint
ALTER TABLE "customer_branches" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_key_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD COLUMN "allocation_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "status" "delivery_status" DEFAULT 'delivered' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "branch_breakdown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "season" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "label_layout" jsonb;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_items" ADD CONSTRAINT "account_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_staff" ADD CONSTRAINT "account_staff_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_staff" ADD CONSTRAINT "account_staff_branch_id_customer_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."customer_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_delivery_supplier_id_suppliers_id_fk" FOREIGN KEY ("delivery_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_ticks" ADD CONSTRAINT "piece_ticks_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_ticks" ADD CONSTRAINT "piece_ticks_delivery_note_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_line_allocations" ADD CONSTRAINT "so_line_allocations_so_line_id_so_lines_id_fk" FOREIGN KEY ("so_line_id") REFERENCES "public"."so_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_line_allocations" ADD CONSTRAINT "so_line_allocations_branch_id_customer_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."customer_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_line_allocations" ADD CONSTRAINT "so_line_allocations_staff_id_account_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."account_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_items_customer_idx" ON "account_items" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "account_staff_customer_idx" ON "account_staff" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_runs_customer_idx" ON "delivery_runs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "piece_ticks_order_idx" ON "piece_ticks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "so_line_alloc_line_idx" ON "so_line_allocations" USING btree ("so_line_id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_allocation_id_so_line_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."so_line_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_run_id_delivery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_notes_run_idx" ON "delivery_notes" USING btree ("run_id");