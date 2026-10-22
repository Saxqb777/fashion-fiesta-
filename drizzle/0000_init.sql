CREATE TYPE "public"."document_type" AS ENUM('quote', 'sales_order', 'delivery_note', 'invoice', 'receipt', 'purchase_order');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'tailor');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"doc_type" "document_type" NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 4 NOT NULL,
	CONSTRAINT "number_sequences_doc_type_unique" UNIQUE("doc_type")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"trade_name" text DEFAULT 'Fashion Fiesta' NOT NULL,
	"legal_name" text NOT NULL,
	"address" text NOT NULL,
	"trn" text NOT NULL,
	"phone" text,
	"email" text,
	"currency" text DEFAULT 'AED' NOT NULL,
	"vat_rate_bp" integer DEFAULT 500 NOT NULL,
	"default_credit_days" integer DEFAULT 30 NOT NULL,
	"bank_name" text,
	"account_name" text,
	"iban" text,
	"account_number" text,
	"swift" text,
	"embroidery_operator_name" text,
	"embroidery_operator_phone" text,
	"embroidery_shop_share_percent" integer DEFAULT 50 NOT NULL,
	"setup_step" text DEFAULT 'account' NOT NULL,
	"setup_complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'tailor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;