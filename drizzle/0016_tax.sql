CREATE TABLE "tax_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text NOT NULL,
	"filed_on" date,
	"reference" text,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"review" jsonb,
	CONSTRAINT "tax_periods_period_start_unique" UNIQUE("period_start")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ct_year_end_month" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ct_trn" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "trade_license" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "trade_license_authority" text;