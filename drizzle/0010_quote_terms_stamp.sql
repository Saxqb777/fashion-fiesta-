ALTER TABLE "settings" ADD COLUMN "quote_validity_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quote_terms" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "stamp_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "stamp_on_documents" boolean DEFAULT false NOT NULL;