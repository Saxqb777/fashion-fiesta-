ALTER TYPE "public"."order_stage" ADD VALUE 'draft' BEFORE 'confirmed';--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "so_lines" ADD COLUMN "draft_assignments" jsonb;