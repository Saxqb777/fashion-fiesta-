import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["owner", "tailor"]);
export const documentType = pgEnum("document_type", [
  "quote",
  "sales_order",
  "delivery_note",
  "invoice",
  "receipt",
  "purchase_order",
]);

/** Columns every table carries. */
const audit = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdBy: uuid("created_by"),
});

export const users = pgTable(
  "users",
  {
    ...audit(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("tailor"),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_unique")
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** One row. Company, money defaults, embroidery operator and setup state. */
export const settings = pgTable("settings", {
  ...audit(),
  tradeName: text("trade_name").notNull().default("Fashion Fiesta"),
  legalName: text("legal_name").notNull(),
  address: text("address").notNull(),
  trn: text("trn").notNull(),
  phone: text("phone"),
  email: text("email"),
  currency: text("currency").notNull().default("AED"),
  /** VAT rate in basis points. 500 = 5%. */
  vatRateBp: integer("vat_rate_bp").notNull().default(500),
  defaultCreditDays: integer("default_credit_days").notNull().default(30),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  iban: text("iban"),
  accountNumber: text("account_number"),
  swift: text("swift"),
  embroideryOperatorName: text("embroidery_operator_name"),
  embroideryOperatorPhone: text("embroidery_operator_phone"),
  /** Shop share of embroidery revenue in percent. 50 = half and half. */
  embroideryShopSharePercent: integer("embroidery_shop_share_percent").notNull().default(50),
  setupStep: text("setup_step").notNull().default("account"),
  setupComplete: boolean("setup_complete").notNull().default(false),
});

export const numberSequences = pgTable("number_sequences", {
  ...audit(),
  docType: documentType("doc_type").notNull().unique(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(4),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid("actor_id"),
  actorName: text("actor_name"),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  changes: jsonb("changes").$type<Record<string, unknown>>(),
});

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type DocumentType = (typeof documentType.enumValues)[number];
