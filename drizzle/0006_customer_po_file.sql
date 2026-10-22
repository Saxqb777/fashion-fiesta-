ALTER TABLE "quotes" ADD COLUMN "customer_po_file_url" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "customer_po_file_name" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_po_file_url" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_po_file_name" text;