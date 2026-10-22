import { sql } from "drizzle-orm";
import {
  boolean,
  index,
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
export const customerType = pgEnum("customer_type", ["retail", "wholesale"]);
export const customerTier = pgEnum("customer_tier", ["vip", "regular", "new"]);
export const supplierType = pgEnum("supplier_type", ["fabric", "outsourcing"]);
export const productKind = pgEnum("product_kind", ["custom", "ready_made"]);
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

/* ---------- Phase 1: master data ---------- */

export const customers = pgTable(
  "customers",
  {
    ...audit(),
    name: text("name").notNull(),
    type: customerType("type").notNull().default("retail"),
    tier: customerTier("tier").notNull().default("new"),
    phone: text("phone"),
    email: text("email"),
    trn: text("trn"),
    address: text("address"),
    /** Null means the shop default from settings. */
    creditDays: integer("credit_days"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

export const customerBranches = pgTable(
  "customer_branches",
  {
    ...audit(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    address: text("address"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("customer_branches_customer_idx").on(t.customerId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    ...audit(),
    name: text("name").notNull(),
    type: supplierType("type").notNull().default("fabric"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    trn: text("trn"),
    city: text("city"),
    address: text("address"),
    paymentDays: integer("payment_days"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

export const productCategories = pgTable("product_categories", {
  ...audit(),
  name: text("name").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const products = pgTable(
  "products",
  {
    ...audit(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => productCategories.id),
    kind: productKind("kind").notNull().default("custom"),
    /** Price before VAT, in fils. */
    priceFils: integer("price_fils").notNull().default(0),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("products_name_idx").on(t.name)],
);

export const fabrics = pgTable(
  "fabrics",
  {
    ...audit(),
    name: text("name").notNull(),
    code: text("code"),
    colour: text("colour"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    /** Per metre, before VAT, in fils. */
    costFils: integer("cost_fils").notNull().default(0),
    priceFils: integer("price_fils").notNull().default(0),
    photoUrl: text("photo_url"),
    /** Where the roll sits in the shop, e.g. "Rack B, shelf 2". Idea 6. */
    shelfLocation: text("shelf_location"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("fabrics_name_idx").on(t.name)],
);

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerBranch = typeof customerBranches.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type ProductCategory = typeof productCategories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Fabric = typeof fabrics.$inferSelect;
export type CustomerType = (typeof customerType.enumValues)[number];
export type CustomerTier = (typeof customerTier.enumValues)[number];
export type SupplierType = (typeof supplierType.enumValues)[number];
export type ProductKind = (typeof productKind.enumValues)[number];
export type Settings = typeof settings.$inferSelect;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type DocumentType = (typeof documentType.enumValues)[number];
