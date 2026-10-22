CREATE TABLE "mission_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"mission_key" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text
);
--> statement-breakpoint
CREATE TABLE "practice_meta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "practice_meta_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "practice_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mission_progress_user_key" ON "mission_progress" USING btree ("user_id","mission_key");--> statement-breakpoint
CREATE INDEX "practice_events_user_idx" ON "practice_events" USING btree ("user_id","kind");