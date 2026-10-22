CREATE TYPE "public"."assignee_type" AS ENUM('tailor', 'unit');--> statement-breakpoint
CREATE TYPE "public"."order_stage" AS ENUM('confirmed', 'stitching', 'ready', 'delivered', 'invoiced', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."task_message_kind" AS ENUM('question', 'answer', 'declined', 'rejected', 'approved', 'note');--> statement-breakpoint
CREATE TYPE "public"."task_photo_kind" AS ENUM('progress', 'submission');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('assigned', 'in_progress', 'submitted', 'approved', 'rejected', 'declined');--> statement-breakpoint
CREATE TABLE "customer_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"values" jsonb NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "measurement_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"quote_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_fils" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"branch_id" uuid,
	"quote_date" date NOT NULL,
	"valid_until" date,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"subtotal_fils" integer DEFAULT 0 NOT NULL,
	"vat_fils" integer DEFAULT 0 NOT NULL,
	"total_fils" integer DEFAULT 0 NOT NULL,
	"order_id" uuid,
	CONSTRAINT "quotes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"branch_id" uuid,
	"quote_id" uuid,
	"order_date" date NOT NULL,
	"due_date" date,
	"stage" "order_stage" DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"subtotal_fils" integer DEFAULT 0 NOT NULL,
	"vat_fils" integer DEFAULT 0 NOT NULL,
	"total_fils" integer DEFAULT 0 NOT NULL,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "sales_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "so_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"order_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_fils" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"vat_fils" integer NOT NULL,
	"due_date" date,
	"fabric_id" uuid,
	"measurement_id" uuid,
	"measurement_label" text,
	"measurements" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "task_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"task_id" uuid NOT NULL,
	"kind" "task_message_kind" NOT NULL,
	"body" text NOT NULL,
	"author_name" text
);
--> statement-breakpoint
CREATE TABLE "task_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"task_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "task_photo_kind" DEFAULT 'progress' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"task_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"order_id" uuid NOT NULL,
	"so_line_id" uuid NOT NULL,
	"assignee_type" "assignee_type" NOT NULL,
	"tailor_id" uuid,
	"supplier_id" uuid,
	"qty" integer NOT NULL,
	"qty_done" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"status" "task_status" DEFAULT 'assigned' NOT NULL,
	"open_question" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_measurements" ADD CONSTRAINT "customer_measurements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_branch_id_customer_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."customer_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_id_customer_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."customer_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_lines" ADD CONSTRAINT "so_lines_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_lines" ADD CONSTRAINT "so_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_lines" ADD CONSTRAINT "so_lines_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "so_lines" ADD CONSTRAINT "so_lines_measurement_id_customer_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."customer_measurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_so_line_id_so_lines_id_fk" FOREIGN KEY ("so_line_id") REFERENCES "public"."so_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tailor_id_users_id_fk" FOREIGN KEY ("tailor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_measurements_customer_idx" ON "customer_measurements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_idx" ON "sales_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_stage_idx" ON "sales_orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "so_lines_order_idx" ON "so_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "task_messages_task_idx" ON "task_messages" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_photos_task_idx" ON "task_photos" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_reviews_task_idx" ON "task_reviews" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_order_idx" ON "tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tasks_line_idx" ON "tasks" USING btree ("so_line_id");--> statement-breakpoint
CREATE INDEX "tasks_tailor_idx" ON "tasks" USING btree ("tailor_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");