CREATE TYPE "public"."customer_tier" AS ENUM('vip', 'regular', 'new');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('retail', 'wholesale');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('custom', 'ready_made');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('fabric', 'outsourcing');--> statement-breakpoint
CREATE TABLE "customer_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"address" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"type" "customer_type" DEFAULT 'retail' NOT NULL,
	"tier" "customer_tier" DEFAULT 'new' NOT NULL,
	"phone" text,
	"email" text,
	"trn" text,
	"address" text,
	"credit_days" integer,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fabrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"code" text,
	"colour" text,
	"supplier_id" uuid,
	"cost_fils" integer DEFAULT 0 NOT NULL,
	"price_fils" integer DEFAULT 0 NOT NULL,
	"photo_url" text,
	"shelf_location" text,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"category_id" uuid,
	"kind" "product_kind" DEFAULT 'custom' NOT NULL,
	"price_fils" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"type" "supplier_type" DEFAULT 'fabric' NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"trn" text,
	"city" text,
	"address" text,
	"payment_days" integer,
	"notes" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_branches" ADD CONSTRAINT "customer_branches_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabrics" ADD CONSTRAINT "fabrics_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_branches_customer_idx" ON "customer_branches" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "fabrics_name_idx" ON "fabrics" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");