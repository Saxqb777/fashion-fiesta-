CREATE TABLE "measurement_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"field_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_measurements" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_measurements" ADD COLUMN "template_name" text;--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "measurement_template_id" uuid;