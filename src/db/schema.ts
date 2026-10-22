import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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
export const supplierType = pgEnum("supplier_type", ["fabric", "outsourcing", "delivery"]);
export const productKind = pgEnum("product_kind", ["custom", "ready_made"]);
export const quoteStatus = pgEnum("quote_status", ["draft", "sent", "accepted", "declined"]);
export const orderStage = pgEnum("order_stage", ["draft", "confirmed", "stitching", "ready", "delivered", "invoiced", "paid", "cancelled"]);
export const assigneeType = pgEnum("assignee_type", ["tailor", "unit"]);
export const taskStatus = pgEnum("task_status", ["assigned", "in_progress", "submitted", "approved", "rejected", "declined"]);
export const taskPhotoKind = pgEnum("task_photo_kind", ["progress", "submission"]);
export const taskMessageKind = pgEnum("task_message_kind", ["question", "answer", "declined", "rejected", "approved", "note"]);
export const documentType = pgEnum("document_type", [
  "quote",
  "sales_order",
  "delivery_note",
  "invoice",
  "receipt",
  "purchase_order",
  "credit_note",
]);
export const invoiceKind = pgEnum("invoice_kind", ["tax_invoice", "opening_balance"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "card", "bank_transfer", "cheque"]);
export const poKind = pgEnum("po_kind", ["fabric", "outsourcing"]);
export const poStatus = pgEnum("po_status", ["draft", "sent", "cancelled"]);
export const qtyUnit = pgEnum("qty_unit", ["m", "pcs"]);
export const stockMoveKind = pgEnum("stock_move_kind", ["opening", "received", "taken", "sent", "adjusted"]);
export const billKind = pgEnum("bill_kind", ["bill", "opening_balance"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "delivered"]);

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
  /** Opening balances: cash in the drawer on the go live day. Seeds the cash book in Phase 5. */
  openingCashFils: integer("opening_cash_fils").notNull().default(0),
  openingDate: date("opening_date"),
  /** Quotes: days a new quote stays valid, and the terms printed on it. */
  quoteValidityDays: integer("quote_validity_days").notNull().default(14),
  quoteTerms: text("quote_terms"),
  /** Shop stamp image, printed in the signatory box when switched on. */
  stampUrl: text("stamp_url"),
  stampOnDocuments: boolean("stamp_on_documents").notNull().default(false),
  /** Garment label sheet. A setting so a thermal printer can replace the A4 sheet later. */
  labelLayout: jsonb("label_layout").$type<LabelLayout>(),
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
    /** Null means no limit. Idea 30: warn, never block. */
    creditLimitFils: integer("credit_limit_fils"),
    /** Phase 4.5: the customer page becomes a full account space. */
    isKeyAccount: boolean("is_key_account").notNull().default(false),
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
    emirate: text("emirate"),
    /** Gate code, opening hours, who receives. Prints on the branch delivery note. */
    deliveryInstructions: text("delivery_instructions"),
    /** False for branches loaded from a public source until the owner confirms them. */
    verified: boolean("verified").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("customer_branches_customer_idx").on(t.customerId)],
);

/** Key account staff, optionally per branch, with their sizes. */
export const accountStaff = pgTable(
  "account_staff",
  {
    ...audit(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    name: text("name").notNull(),
    role: text("role"),
    /** Free text, for example "Top M, Pant 32". */
    sizes: text("sizes"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("account_staff_customer_idx").on(t.customerId)],
);

/** A key account's uniform items with the price agreed with them. */
export const accountItems = pgTable(
  "account_items",
  {
    ...audit(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    productId: uuid("product_id").references(() => products.id),
    name: text("name").notNull(),
    agreedPriceFils: integer("agreed_price_fils").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("account_items_customer_idx").on(t.customerId)],
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
    /** What the shop owed this supplier on the go live day. Becomes their first bill in Phase 4. */
    openingBalanceFils: integer("opening_balance_fils").notNull().default(0),
    openingBalanceDate: date("opening_balance_date"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

export const productCategories = pgTable("product_categories", {
  ...audit(),
  name: text("name").notNull(),
  /** Which measurements to take for products in this category. */
  measurementTemplateId: uuid("measurement_template_id"),
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
    /** Default fabric used per piece, in hundredths of a metre (250 = 2.50 m). Idea 29. */
    metresPerPieceCenti: integer("metres_per_piece_centi"),
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
    /** Warn when stock falls to this many hundredths of a metre. */
    lowStockCenti: integer("low_stock_centi"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("fabrics_name_idx").on(t.name)],
);

/* ---------- Phase 2: measurements, quotes, orders, tasks ---------- */

export type MeasurementValue = { name: string; value: string };
export type DraftAssignment = { type: "tailor" | "unit"; assigneeId: string; qty: number };
/** Label sheet geometry in millimetres. The default is an A4 sheet of 24, 70 x 37. */
export type LabelLayout = { name: string; pageWidthMm: number; pageHeightMm: number; cols: number; rows: number; widthMm: number; heightMm: number; topMm: number; leftMm: number; gapXMm: number; gapYMm: number };

export const measurementFields = pgTable("measurement_fields", {
  ...audit(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** A garment's measurements: an ordered pick of the master fields. Pant: Waist, Hips, Length... */
export const measurementTemplates = pgTable("measurement_templates", {
  ...audit(),
  name: text("name").notNull(),
  /** Field ids from measurement_fields, in the order they are taken. */
  fieldIds: jsonb("field_ids").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const customerMeasurements = pgTable(
  "customer_measurements",
  {
    ...audit(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    /** "Self", "Daughter", "Size M", a branch size run. */
    label: text("label").notNull(),
    /** The garment template used when measuring. Older sets have none. */
    templateId: uuid("template_id"),
    templateName: text("template_name"),
    values: jsonb("values").$type<MeasurementValue[]>().notNull(),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("customer_measurements_customer_idx").on(t.customerId)],
);

export const quotes = pgTable(
  "quotes",
  {
    ...audit(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    quoteDate: date("quote_date").notNull(),
    validUntil: date("valid_until"),
    status: quoteStatus("status").notNull().default("draft"),
    notes: text("notes"),
    /** The customer's own document (their PO or quote) kept as a file. Set by Read their document. */
    customerPoFileUrl: text("customer_po_file_url"),
    customerPoFileName: text("customer_po_file_name"),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
    orderId: uuid("order_id"),
  },
  (t) => [index("quotes_customer_idx").on(t.customerId)],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    ...audit(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
    notes: text("notes"),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId)],
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    ...audit(),
    /** Null while the order is a draft. Taken on Confirm order, never reused. */
    number: text("number").unique(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    quoteId: uuid("quote_id"),
    /** The customer's own purchase order number. Called "Customer PO" in the app. */
    customerPoNumber: text("customer_po_number"),
    /** The customer's own document (their PO or quote) kept as a file. Set by Read their document. */
    customerPoFileUrl: text("customer_po_file_url"),
    customerPoFileName: text("customer_po_file_name"),
    orderDate: date("order_date").notNull(),
    dueDate: date("due_date"),
    /** Free label such as "Winter 2026". Autocompletes from earlier orders. */
    season: text("season"),
    stage: orderStage("stage").notNull().default("confirmed"),
    notes: text("notes"),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("sales_orders_customer_idx").on(t.customerId), index("sales_orders_stage_idx").on(t.stage)],
);

export const soLines = pgTable(
  "so_lines",
  {
    ...audit(),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
    dueDate: date("due_date"),
    fabricId: uuid("fabric_id").references(() => fabrics.id),
    /** Fabric per piece for this line, hundredths of a metre. Prefilled from the product. */
    metresPerPieceCenti: integer("metres_per_piece_centi"),
    measurementId: uuid("measurement_id").references(() => customerMeasurements.id),
    /** Frozen copy taken when the order was made. Later edits to the customer card do not change it. */
    measurementLabel: text("measurement_label"),
    measurements: jsonb("measurements").$type<MeasurementValue[]>(),
    notes: text("notes"),
    /** Planned assignments while the order is a draft. Become tasks on Confirm order. */
    draftAssignments: jsonb("draft_assignments").$type<DraftAssignment[]>(),
  },
  (t) => [index("so_lines_order_idx").on(t.orderId)],
);

/** Optional split of an order line per branch and per person. The parts add up to the line quantity. */
export const soLineAllocations = pgTable(
  "so_line_allocations",
  {
    ...audit(),
    soLineId: uuid("so_line_id").notNull().references(() => soLines.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    staffId: uuid("staff_id").references(() => accountStaff.id),
    personName: text("person_name"),
    size: text("size"),
    qty: integer("qty").notNull(),
  },
  (t) => [index("so_line_alloc_line_idx").on(t.soLineId)],
);

/** One trip to an emirate by a delivery company. Holds one delivery note per branch. */
export const deliveryRuns = pgTable(
  "delivery_runs",
  {
    ...audit(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    runDate: date("run_date").notNull(),
    emirate: text("emirate"),
    deliverySupplierId: uuid("delivery_supplier_id").references(() => suppliers.id),
    notes: text("notes"),
  },
  (t) => [index("delivery_runs_customer_idx").on(t.customerId)],
);

export const tasks = pgTable(
  "tasks",
  {
    ...audit(),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    soLineId: uuid("so_line_id").notNull().references(() => soLines.id, { onDelete: "cascade" }),
    assigneeType: assigneeType("assignee_type").notNull(),
    tailorId: uuid("tailor_id").references(() => users.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    qty: integer("qty").notNull(),
    qtyDone: integer("qty_done").notNull().default(0),
    dueDate: date("due_date"),
    status: taskStatus("status").notNull().default("assigned"),
    openQuestion: boolean("open_question").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_order_idx").on(t.orderId),
    index("tasks_line_idx").on(t.soLineId),
    index("tasks_tailor_idx").on(t.tailorId),
    index("tasks_status_idx").on(t.status),
  ],
);

export const taskPhotos = pgTable(
  "task_photos",
  {
    ...audit(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: taskPhotoKind("kind").notNull().default("progress"),
  },
  (t) => [index("task_photos_task_idx").on(t.taskId)],
);

export const taskMessages = pgTable(
  "task_messages",
  {
    ...audit(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    kind: taskMessageKind("kind").notNull(),
    body: text("body").notNull(),
    authorName: text("author_name"),
  },
  (t) => [index("task_messages_task_idx").on(t.taskId)],
);

export const taskReviews = pgTable(
  "task_reviews",
  {
    ...audit(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    decision: text("decision").$type<"approved" | "rejected">().notNull(),
    reason: text("reason"),
  },
  (t) => [index("task_reviews_task_idx").on(t.taskId)],
);

/* ---------- Phase 3: delivery, invoices, credit notes, payments ---------- */

export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    ...audit(),
    number: text("number").notNull().unique(),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    deliveryDate: date("delivery_date").notNull(),
    customerPoNumber: text("customer_po_number"),
    notes: text("notes"),
    runId: uuid("run_id").references(() => deliveryRuns.id),
    /** Notes made at the counter are delivered on the spot. Notes on a run start pending. */
    status: deliveryStatus("status").notNull().default("delivered"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    receivedBy: text("received_by"),
  },
  (t) => [index("delivery_notes_order_idx").on(t.orderId), index("delivery_notes_run_idx").on(t.runId)],
);

export const deliveryNoteLines = pgTable(
  "delivery_note_lines",
  {
    ...audit(),
    deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
    soLineId: uuid("so_line_id").notNull().references(() => soLines.id),
    allocationId: uuid("allocation_id").references(() => soLineAllocations.id),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => [index("dn_lines_dn_idx").on(t.deliveryNoteId), index("dn_lines_so_line_idx").on(t.soLineId)],
);

/** A garment label ticked off at delivery. Labels themselves are worked out from the lines and splits. */
export const pieceTicks = pgTable(
  "piece_ticks",
  {
    ...audit(),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    /** soLineId:allocationId or "-":piece number. One row per piece. */
    pieceKey: text("piece_key").notNull().unique(),
    deliveryNoteId: uuid("delivery_note_id").references(() => deliveryNotes.id, { onDelete: "set null" }),
  },
  (t) => [index("piece_ticks_order_idx").on(t.orderId)],
);

export const invoices = pgTable(
  "invoices",
  {
    ...audit(),
    kind: invoiceKind("kind").notNull().default("tax_invoice"),
    /** FF-INV number for tax invoices. Null for opening balances, which are not tax invoices. */
    number: text("number").unique(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").references(() => customerBranches.id),
    orderId: uuid("order_id").references(() => salesOrders.id),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    customerPoNumber: text("customer_po_number"),
    notes: text("notes"),
    /** Prints quantities per branch under the lines, for key accounts that ask for it. */
    branchBreakdown: boolean("branch_breakdown").notNull().default(false),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
  },
  (t) => [index("invoices_customer_idx").on(t.customerId), index("invoices_order_idx").on(t.orderId), index("invoices_due_idx").on(t.dueDate)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    ...audit(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    soLineId: uuid("so_line_id").references(() => soLines.id),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId), index("invoice_lines_so_line_idx").on(t.soLineId)],
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    ...audit(),
    number: text("number").notNull().unique(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    creditDate: date("credit_date").notNull(),
    reason: text("reason").notNull(),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
  },
  (t) => [index("credit_notes_invoice_idx").on(t.invoiceId), index("credit_notes_customer_idx").on(t.customerId)],
);

export const creditNoteLines = pgTable(
  "credit_note_lines",
  {
    ...audit(),
    creditNoteId: uuid("credit_note_id").notNull().references(() => creditNotes.id, { onDelete: "cascade" }),
    invoiceLineId: uuid("invoice_line_id").references(() => invoiceLines.id),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
  },
  (t) => [index("cn_lines_cn_idx").on(t.creditNoteId)],
);

export const payments = pgTable(
  "payments",
  {
    ...audit(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    /** Set for a deposit taken on an order before it is invoiced. */
    orderId: uuid("order_id").references(() => salesOrders.id),
    isDeposit: boolean("is_deposit").notNull().default(false),
    paymentDate: date("payment_date").notNull(),
    amountFils: integer("amount_fils").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
  },
  (t) => [index("payments_customer_idx").on(t.customerId), index("payments_order_idx").on(t.orderId)],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    ...audit(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    amountFils: integer("amount_fils").notNull(),
  },
  (t) => [index("allocations_payment_idx").on(t.paymentId), index("allocations_invoice_idx").on(t.invoiceId)],
);

/* ---------- Phase 4: purchases, stock, supplier bills and payments ---------- */

/** Quantities in purchases and stock are hundredths: 1250 = 12.50 m, 300 = 3 pieces. */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...audit(),
    /** FF-PO number, given on Confirm. Drafts have none. */
    number: text("number").unique(),
    kind: poKind("kind").notNull().default("fabric"),
    status: poStatus("status").notNull().default("draft"),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    /** Outsourcing POs belong to one sales order. */
    orderId: uuid("order_id").references(() => salesOrders.id),
    poDate: date("po_date").notNull(),
    expectedDate: date("expected_date"),
    notes: text("notes"),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("po_supplier_idx").on(t.supplierId), index("po_order_idx").on(t.orderId)],
);

export const poLines = pgTable(
  "po_lines",
  {
    ...audit(),
    poId: uuid("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    fabricId: uuid("fabric_id").references(() => fabrics.id),
    productId: uuid("product_id").references(() => products.id),
    /** Outsourcing: the order line and task this stitching charge is for. */
    soLineId: uuid("so_line_id").references(() => soLines.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    unit: qtyUnit("unit").notNull().default("m"),
    qtyCenti: integer("qty_centi").notNull(),
    /** Per metre or per piece, before VAT. */
    unitPriceFils: integer("unit_price_fils").notNull().default(0),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
  },
  (t) => [index("po_lines_po_idx").on(t.poId), index("po_lines_task_idx").on(t.taskId)],
);

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    ...audit(),
    poId: uuid("po_id").notNull().references(() => purchaseOrders.id),
    receivedDate: date("received_date").notNull(),
    notes: text("notes"),
  },
  (t) => [index("receipts_po_idx").on(t.poId)],
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    ...audit(),
    receiptId: uuid("receipt_id").notNull().references(() => goodsReceipts.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id").notNull().references(() => poLines.id),
    qtyCenti: integer("qty_centi").notNull(),
  },
  (t) => [index("receipt_lines_receipt_idx").on(t.receiptId), index("receipt_lines_po_line_idx").on(t.poLineId)],
);

/** Every metre in or out. Stock on hand is the sum. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...audit(),
    fabricId: uuid("fabric_id").notNull().references(() => fabrics.id),
    kind: stockMoveKind("kind").notNull(),
    /** Positive comes in, negative goes out. Hundredths of a metre. */
    qtyCenti: integer("qty_centi").notNull(),
    movedOn: date("moved_on").notNull(),
    receiptId: uuid("receipt_id").references(() => goodsReceipts.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    poId: uuid("po_id").references(() => purchaseOrders.id),
    note: text("note"),
  },
  (t) => [index("stock_fabric_idx").on(t.fabricId), index("stock_task_idx").on(t.taskId), index("stock_po_idx").on(t.poId)],
);

export const supplierBills = pgTable(
  "supplier_bills",
  {
    ...audit(),
    kind: billKind("kind").notNull().default("bill"),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    poId: uuid("po_id").references(() => purchaseOrders.id),
    /** The supplier's own invoice number. */
    billNumber: text("bill_number"),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** Their TRN as printed on the bill. Input VAT needs a tax invoice with a TRN. */
    supplierTrn: text("supplier_trn"),
    notes: text("notes"),
    fileUrl: text("file_url"),
    subtotalFils: integer("subtotal_fils").notNull().default(0),
    vatFils: integer("vat_fils").notNull().default(0),
    totalFils: integer("total_fils").notNull().default(0),
  },
  (t) => [index("bills_supplier_idx").on(t.supplierId), index("bills_po_idx").on(t.poId), index("bills_due_idx").on(t.dueDate)],
);

export const supplierBillLines = pgTable(
  "supplier_bill_lines",
  {
    ...audit(),
    billId: uuid("bill_id").notNull().references(() => supplierBills.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    poLineId: uuid("po_line_id").references(() => poLines.id),
    description: text("description").notNull(),
    unit: qtyUnit("unit").notNull().default("pcs"),
    qtyCenti: integer("qty_centi").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    netFils: integer("net_fils").notNull(),
    vatFils: integer("vat_fils").notNull(),
  },
  (t) => [index("bill_lines_bill_idx").on(t.billId), index("bill_lines_po_line_idx").on(t.poLineId)],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    ...audit(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    paymentDate: date("payment_date").notNull(),
    amountFils: integer("amount_fils").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
  },
  (t) => [index("supplier_payments_supplier_idx").on(t.supplierId)],
);

export const supplierPaymentAllocations = pgTable(
  "supplier_payment_allocations",
  {
    ...audit(),
    paymentId: uuid("payment_id").notNull().references(() => supplierPayments.id, { onDelete: "cascade" }),
    billId: uuid("bill_id").notNull().references(() => supplierBills.id),
    amountFils: integer("amount_fils").notNull(),
  },
  (t) => [index("supplier_alloc_payment_idx").on(t.paymentId), index("supplier_alloc_bill_idx").on(t.billId)],
);

export type User = typeof users.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type MeasurementField = typeof measurementFields.$inferSelect;
export type MeasurementTemplate = typeof measurementTemplates.$inferSelect;
export type CustomerMeasurement = typeof customerMeasurements.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type SalesOrder = typeof salesOrders.$inferSelect;
export type SoLine = typeof soLines.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type OrderStage = (typeof orderStage.enumValues)[number];
export type QuoteStatus = (typeof quoteStatus.enumValues)[number];
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
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PoLine = typeof poLines.$inferSelect;
export type SupplierBill = typeof supplierBills.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type QtyUnit = (typeof qtyUnit.enumValues)[number];
export type AccountStaff = typeof accountStaff.$inferSelect;
export type AccountItem = typeof accountItems.$inferSelect;
export type SoLineAllocation = typeof soLineAllocations.$inferSelect;
export type DeliveryRun = typeof deliveryRuns.$inferSelect;
