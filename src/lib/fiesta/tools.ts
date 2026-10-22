import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customerBranches, customers, suppliers, users } from "@/db/schema";
import { potBalances, expectedCashOn } from "@/lib/cash";
import { addDaysISO, todayISO } from "@/lib/dates";
import { operatorBalance } from "@/lib/embroidery";
import { customerHealth } from "@/lib/health";
import { agingByCustomer } from "@/lib/ledger";
import { reportTables, REPORT_NAMES, type ReportName } from "@/lib/report-registry";

/**
 * Fiesta's tools. Read tools answer from the shop's own data. Prepare tools only describe an action:
 * the panel shows it as a card and nothing is saved or sent until the owner taps Confirm.
 */

const aed = (fils: number | null | undefined) => Math.round(Number(fils ?? 0)) / 100;
const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Use the id from an earlier tool result.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates as YYYY-MM-DD.");
const rows = <T,>(r: { rows: T[] }) => r.rows;

export type Card =
  | { kind: "payment"; customerId: string; customerName: string; amount: number; method: "cash" | "card" | "bank_transfer" | "cheque"; invoiceId: string | null; invoiceNumber: string | null; reference: string | null }
  | { kind: "assign"; taskId: string; taskLabel: string; tailorId: string; tailorName: string }
  | { kind: "draft"; mode: "order" | "quote"; customerId: string; customerName: string; branchId: string | null; branchName: string | null; customerPoNumber: string | null; notes: string | null; lines: { description: string; qty: number; unitPrice: number }[] }
  | { kind: "email"; customerId: string; customerName: string; to: string; subject: string; body: string }
  | { kind: "message"; channel: "whatsapp" | "email" | "text"; toName: string; phone: string | null; text: string };

export type ToolOutcome = { result: unknown; card?: Card; navigate?: { path: string; label: string } };

type ToolDef<S extends z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  json: Anthropic.Beta.BetaTool["input_schema"];
  run: (input: z.infer<S>, ctx: { userId: string }) => Promise<ToolOutcome>;
};
const def = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d;

/* ---------- read tools ---------- */

const findCustomers = def({
  name: "find_customers",
  description: "Find customers by part of their name, phone or email. Returns id, name, type, tier, phone, email, branches count and what they owe now. Use this before any other customer tool when you only have a name.",
  schema: z.object({ query: z.string().min(1).max(80) }),
  json: { type: "object", properties: { query: { type: "string", description: "Part of the name, phone or email" } }, required: ["query"], additionalProperties: false },
  run: async ({ query }) => {
    const like = `%${query.trim()}%`;
    const found = await db
      .select({ id: customers.id, name: customers.name, type: customers.type, tier: customers.tier, phone: customers.phone, email: customers.email, keyAccount: customers.isKeyAccount })
      .from(customers)
      .where(and(isNull(customers.deletedAt), or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.email, like))))
      .limit(10);
    const owed = new Map((await agingByCustomer()).map((a) => [a.customerId, a]));
    return {
      result: found.map((c) => ({ ...c, owesAed: aed(owed.get(c.id)?.owed), overdueAed: aed((owed.get(c.id)?.d1_30 ?? 0) + (owed.get(c.id)?.d31_60 ?? 0) + (owed.get(c.id)?.d61 ?? 0)) })),
    };
  },
});

const customerSummary = def({
  name: "customer_summary",
  description: "Everything about one customer: contact, credit terms, branches, balance and ageing, open invoices, recent orders, value ordered this year, last order and average days to pay.",
  schema: z.object({ customer_id: uuid }),
  json: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"], additionalProperties: false },
  run: async ({ customer_id }) => {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, customer_id) });
    if (!c) return { result: { error: "No customer with that id." } };
    const today = todayISO();
    const [branches, [aging], [health], orders, openInvoices] = await Promise.all([
      db.select({ id: customerBranches.id, name: customerBranches.name, emirate: customerBranches.emirate }).from(customerBranches).where(and(eq(customerBranches.customerId, c.id), isNull(customerBranches.deletedAt))),
      agingByCustomer(c.id),
      customerHealth(today, c.id),
      db.execute<{ id: string; number: string | null; stage: string; order_date: string; total_fils: number; customer_po_number: string | null }>(
        sql`select id, number, stage, order_date::text, total_fils, customer_po_number from sales_orders where customer_id = ${c.id} order by order_date desc limit 12`,
      ),
      db.execute<{ id: string; number: string; invoice_date: string; due_date: string; total_fils: number; paid: number; credited: number }>(sql`
        select i.id, i.number, i.invoice_date::text, i.due_date::text, i.total_fils,
          coalesce((select sum(a.amount_fils) from payment_allocations a where a.invoice_id = i.id), 0)::int paid,
          coalesce((select sum(cn.total_fils) from credit_notes cn where cn.invoice_id = i.id), 0)::int credited
        from invoices i where i.customer_id = ${c.id} order by i.invoice_date desc limit 30`),
    ]);
    return {
      result: {
        id: c.id, name: c.name, type: c.type, tier: c.tier, phone: c.phone, email: c.email, trn: c.trn, keyAccount: c.isKeyAccount,
        creditDays: c.creditDays, creditLimitAed: c.creditLimitFils === null ? null : aed(c.creditLimitFils),
        branches: branches.slice(0, 40), branchCount: branches.length,
        owesAed: aed(aging?.owed), notDueAed: aed(aging?.notDue), late1to30Aed: aed(aging?.d1_30), late31to60Aed: aed(aging?.d31_60), lateOver60Aed: aed(aging?.d61), paidInAdvanceAed: aed(aging?.credit),
        lastOrder: health?.lastOrder ?? null, orderedThisYearAed: aed(health?.yearFils), avgDaysToPay: health?.avgDaysToPay ?? null,
        recentOrders: rows(orders).map((o) => ({ ...o, total_fils: undefined, totalAed: aed(o.total_fils) })),
        unpaidInvoices: rows(openInvoices)
          .map((i) => ({ id: i.id, number: i.number, date: i.invoice_date, due: i.due_date, totalAed: aed(i.total_fils), balanceAed: aed(i.total_fils - i.paid - i.credited), overdue: i.due_date < today }))
          .filter((i) => i.balanceAed > 0),
      },
    };
  },
});

const searchOrders = def({
  name: "search_orders",
  description: "List sales orders, newest first. Filter by customer, stage, text in a line, or order date range. Stages: draft, confirmed, stitching, ready, delivered, invoiced, paid, cancelled.",
  schema: z.object({
    customer_id: uuid.nullable().optional(),
    stage: z.enum(["draft", "confirmed", "stitching", "ready", "delivered", "invoiced", "paid", "cancelled"]).nullable().optional(),
    text: z.string().max(80).nullable().optional(),
    from: isoDate.nullable().optional(),
    to: isoDate.nullable().optional(),
  }),
  json: {
    type: "object",
    properties: {
      customer_id: { type: ["string", "null"] },
      stage: { type: ["string", "null"], enum: ["draft", "confirmed", "stitching", "ready", "delivered", "invoiced", "paid", "cancelled", null] },
      text: { type: ["string", "null"], description: "Words in a line description or the order or Customer PO number" },
      from: { type: ["string", "null"], description: "YYYY-MM-DD" },
      to: { type: ["string", "null"], description: "YYYY-MM-DD" },
    },
    additionalProperties: false,
  },
  run: async (f) => {
    const res = await db.execute<{ id: string; number: string | null; customer: string; stage: string; order_date: string; due_date: string | null; total_fils: number; pieces: number; customer_po_number: string | null }>(sql`
      select o.id, o.number, c.name customer, o.stage, o.order_date::text, o.due_date::text, o.total_fils, o.customer_po_number,
        (select coalesce(sum(qty), 0) from so_lines l where l.order_id = o.id)::int pieces
      from sales_orders o join customers c on c.id = o.customer_id
      where true
        ${f.customer_id ? sql`and o.customer_id = ${f.customer_id}` : sql``}
        ${f.stage ? sql`and o.stage = ${f.stage}` : sql``}
        ${f.from ? sql`and o.order_date >= ${f.from}` : sql``}
        ${f.to ? sql`and o.order_date <= ${f.to}` : sql``}
        ${f.text ? sql`and (o.number ilike ${`%${f.text}%`} or o.customer_po_number ilike ${`%${f.text}%`} or exists (select 1 from so_lines l where l.order_id = o.id and l.description ilike ${`%${f.text}%`}))` : sql``}
      order by o.order_date desc, o.created_at desc limit 40`);
    const list = rows(res);
    return { result: { count: list.length, orders: list.map((o) => ({ ...o, total_fils: undefined, totalAed: aed(o.total_fils), href: `/orders/${o.id}` })) } };
  },
});

const getOrder = def({
  name: "get_order",
  description: "One order in full: lines, who is stitching each line and how far, delivery notes, invoices and payments. Accepts the order id or its number like FF-SO-1027.",
  schema: z.object({ order: z.string().min(3).max(60) }),
  json: { type: "object", properties: { order: { type: "string", description: "Order id or number" } }, required: ["order"], additionalProperties: false },
  run: async ({ order }) => {
    const [o] = rows(
      await db.execute<{ id: string; number: string | null; customer_id: string; customer: string; stage: string; order_date: string; due_date: string | null; total_fils: number; customer_po_number: string | null; notes: string | null }>(sql`
        select o.id, o.number, o.customer_id, c.name customer, o.stage, o.order_date::text, o.due_date::text, o.total_fils, o.customer_po_number, o.notes
        from sales_orders o join customers c on c.id = o.customer_id
        where ${/^[0-9a-f-]{36}$/.test(order) ? sql`o.id = ${order}` : sql`o.number ilike ${order.trim()}`} limit 1`),
    );
    if (!o) return { result: { error: "No order found." } };
    const [lines, tasks, docs] = await Promise.all([
      db.execute(sql`select id, description, qty, unit_price_fils, net_fils + vat_fils total_fils from so_lines where order_id = ${o.id} order by sort`),
      db.execute(sql`
        select t.id, l.description, t.qty, t.qty_done, t.status, t.due_date::text, coalesce(u.name, s.name) assignee
        from tasks t join so_lines l on l.id = t.so_line_id left join users u on u.id = t.tailor_id left join suppliers s on s.id = t.supplier_id
        where t.order_id = ${o.id}`),
      db.execute(sql`
        select 'delivery note' kind, number, delivery_date::text date, null::int total_fils from delivery_notes where order_id = ${o.id}
        union all select 'tax invoice', number, invoice_date::text, total_fils from invoices where order_id = ${o.id}
        union all select case when is_deposit then 'deposit' else 'payment' end, number, payment_date::text, amount_fils from payments where order_id = ${o.id}
        order by 3`),
    ]);
    return { result: { ...o, total_fils: undefined, totalAed: aed(o.total_fils), href: `/orders/${o.id}`, lines: lines.rows, tasks: tasks.rows, documents: docs.rows } };
  },
});

const runReport = def({
  name: "run_report",
  description:
    "Run one of the app's reports and get its rows. owes: who owes money by age. sales: sales by month for 12 months and by customer this year. vat: the VAT return for a quarter (quarter_start as YYYY-MM-DD, empty for the current one). profit: profit and loss for a month (month as YYYY-MM, empty for this month). tailors: pieces and on time rate per tailor. customers: last order, value this year and days to pay per customer (quiet: only those with no order for 90 days). Money is in fils (divide by 100 for AED).",
  schema: z.object({ name: z.enum(REPORT_NAMES), month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(), quarter_start: isoDate.nullable().optional(), quiet: z.boolean().nullable().optional() }),
  json: {
    type: "object",
    properties: {
      name: { type: "string", enum: [...REPORT_NAMES] },
      month: { type: ["string", "null"], description: "YYYY-MM, for profit" },
      quarter_start: { type: ["string", "null"], description: "YYYY-MM-DD, for vat" },
      quiet: { type: ["boolean", "null"], description: "For customers: only those quiet for 90 days" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  run: async (r) => {
    const params = new URLSearchParams();
    if (r.month) params.set("m", r.month);
    if (r.quarter_start) params.set("q", r.quarter_start);
    if (r.quiet) params.set("show", "quiet");
    const tables = await reportTables(r.name as ReportName, params);
    return { result: tables.map((t) => ({ title: t.title, columns: t.columns.map((c) => `${c.key}${c.kind === "money" ? " (fils)" : ""}`), rows: t.rows.slice(0, 80), totals: t.totals ?? null, moreRows: Math.max(0, t.rows.length - 80) })) };
  },
});

const tailorOutput = def({
  name: "tailor_output",
  description: "Pieces each tailor or stitching unit finished (approved) between two dates, optionally only lines matching some text such as pants or abaya. Also shows work in hand now.",
  schema: z.object({ from: isoDate, to: isoDate, text: z.string().max(60).nullable().optional(), tailor_name: z.string().max(60).nullable().optional() }),
  json: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD" },
      to: { type: "string", description: "YYYY-MM-DD" },
      text: { type: ["string", "null"], description: "Only lines whose description contains this" },
      tailor_name: { type: ["string", "null"] },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },
  run: async (f) => {
    const res = await db.execute(sql`
      select coalesce(u.name, s.name) who,
        coalesce(sum(t.qty) filter (where t.status = 'approved' and t.approved_at::date between ${f.from} and ${f.to}), 0)::int finished_pieces,
        count(*) filter (where t.status = 'approved' and t.approved_at::date between ${f.from} and ${f.to})::int finished_tasks,
        coalesce(sum(t.qty - t.qty_done) filter (where t.status in ('assigned', 'in_progress', 'rejected')), 0)::int pieces_in_hand
      from tasks t join so_lines l on l.id = t.so_line_id left join users u on u.id = t.tailor_id left join suppliers s on s.id = t.supplier_id
      where true
        ${f.text ? sql`and l.description ilike ${`%${f.text}%`}` : sql``}
        ${f.tailor_name ? sql`and coalesce(u.name, s.name) ilike ${`%${f.tailor_name}%`}` : sql``}
      group by 1 order by 2 desc`);
    return { result: res.rows };
  },
});

const listTasks = def({
  name: "list_tasks",
  description: "Workshop tasks with their id, order, line, who has them, pieces done and status. Filter by status (assigned, in_progress, submitted, approved, rejected, declined) and by tailor name. Use before preparing a reassignment.",
  schema: z.object({ status: z.enum(["assigned", "in_progress", "submitted", "approved", "rejected", "declined"]).nullable().optional(), tailor_name: z.string().max(60).nullable().optional() }),
  json: {
    type: "object",
    properties: {
      status: { type: ["string", "null"], enum: ["assigned", "in_progress", "submitted", "approved", "rejected", "declined", null] },
      tailor_name: { type: ["string", "null"] },
    },
    additionalProperties: false,
  },
  run: async (f) => {
    const res = await db.execute(sql`
      select t.id, o.number order_number, c.name customer, l.description, t.qty, t.qty_done, t.status, t.due_date::text, coalesce(u.name, s.name) assignee, t.open_question
      from tasks t join sales_orders o on o.id = t.order_id join customers c on c.id = o.customer_id join so_lines l on l.id = t.so_line_id
        left join users u on u.id = t.tailor_id left join suppliers s on s.id = t.supplier_id
      where true
        ${f.status ? sql`and t.status = ${f.status}` : sql`and t.status <> 'approved'`}
        ${f.tailor_name ? sql`and coalesce(u.name, s.name) ilike ${`%${f.tailor_name}%`}` : sql``}
      order by t.due_date nulls last limit 50`);
    return { result: res.rows.map((r) => ({ ...r, href: `/workshop/tasks/${(r as { id: string }).id}` })) };
  },
});

const team = def({
  name: "team",
  description: "The tailors and owners with their ids, plus the stitching units. Use for assigning work or when she names a person.",
  schema: z.object({}),
  json: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const [people, units] = await Promise.all([
      db.select({ id: users.id, name: users.name, role: users.role, phone: users.phone }).from(users).where(and(eq(users.isActive, true), isNull(users.deletedAt))),
      db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(and(eq(suppliers.type, "outsourcing"), isNull(suppliers.deletedAt))),
    ]);
    return { result: { people: people.filter((p) => p.role === "tailor" || p.role === "owner"), stitchingUnits: units } };
  },
});

const fabricStock = def({
  name: "fabric_stock",
  description: "Every fabric with metres on the shelf, the low stock level, shelf spot, supplier and cost per metre. Flags the ones running low.",
  schema: z.object({}),
  json: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const res = await db.execute<{ name: string; colour: string | null; metres: number; low: number | null; shelf: string | null; supplier: string | null; cost_fils: number }>(sql`
      select f.name, f.colour, coalesce(sum(m.qty_centi), 0)::int / 100.0 metres, f.low_stock_centi / 100.0 low, f.shelf_location shelf, s.name supplier, f.cost_fils
      from fabrics f left join stock_movements m on m.fabric_id = f.id left join suppliers s on s.id = f.supplier_id
      where f.deleted_at is null group by f.id, s.name order by f.name`);
    return { result: rows(res).map((r) => ({ ...r, cost_fils: undefined, costPerMetreAed: aed(r.cost_fils), runningLow: r.low !== null && Number(r.metres) <= Number(r.low) })) };
  },
});

const moneyNow = def({
  name: "money_now",
  description: "Cash in the drawer, money in the bank, what the drawer should hold at closing today, what is owed to the shop, bills the shop owes suppliers, and the balance with the embroidery operator.",
  schema: z.object({}),
  json: { type: "object", properties: {}, additionalProperties: false },
  run: async () => {
    const today = todayISO();
    const [pots, expected, owed, bills, emb] = await Promise.all([
      potBalances(),
      expectedCashOn(today),
      agingByCustomer(),
      db.execute<{ supplier: string; owed: number; overdue: number }>(sql`
        select s.name supplier,
          sum(b.total_fils - coalesce((select sum(a.amount_fils) from supplier_payment_allocations a where a.bill_id = b.id), 0))::int owed,
          sum(case when b.due_date < ${today} then b.total_fils - coalesce((select sum(a.amount_fils) from supplier_payment_allocations a where a.bill_id = b.id), 0) else 0 end)::int overdue
        from supplier_bills b join suppliers s on s.id = b.supplier_id group by s.name`),
      operatorBalance(),
    ]);
    return {
      result: {
        cashInDrawerAed: aed(pots.cash), bankAed: aed(pots.bank), expectedInDrawerAtCloseAed: aed(expected),
        customersOweAed: aed(owed.reduce((s, r) => s + Math.max(0, r.owed), 0)),
        shopOwesSuppliers: rows(bills).filter((b) => b.owed > 0).map((b) => ({ supplier: b.supplier, owedAed: aed(b.owed), overdueAed: aed(b.overdue) })),
        embroideryOperatorBalanceAed: aed(emb), embroideryNote: "Positive means the shop owes the operator, negative means the operator owes the shop.",
      },
    };
  },
});

/* ---------- prepare tools: shown as cards, saved only on her tap ---------- */

const NAV = /^\/(today|orders|customers|money|workshop|purchases|reports|settings)(\/[\w\-./]*)?(\?[\w\-=&.%]*)?$/;

const navigate = def({
  name: "navigate",
  description:
    "Open a page in the app for her. Pages: /today, /orders (?view=drafts), /orders/new?customer=<id>, /orders/quotes, /orders/quotes/new?customer=<id>, /orders/<order id>, /customers, /customers/<id>, /money (who owes you), /money/invoices, /money/invoices/<id>, /money/payments, /money/payments/new?customer=<id>, /money/statement/<customer id>, /money/cash, /money/expenses, /money/sales, /workshop, /workshop/tasks/<id>, /workshop/gallery, /workshop/embroidery, /purchases/orders, /purchases/orders/new, /purchases/owe, /purchases/fabrics, /purchases/suppliers, /reports, /reports/sales, /reports/profit, /reports/vat, /reports/tailors, /reports/customers, /settings/shop, /settings/money, /settings/team, /settings/help. Opening a page saves nothing.",
  schema: z.object({ path: z.string().regex(NAV, "Use one of the listed app pages."), label: z.string().min(1).max(60) }),
  json: { type: "object", properties: { path: { type: "string" }, label: { type: "string", description: "Short words for the link, like Bedashing" } }, required: ["path", "label"], additionalProperties: false },
  run: async ({ path, label }) => ({ result: { opened: path }, navigate: { path, label } }),
});

const preparePayment = def({
  name: "prepare_payment",
  description: "Prepare a customer payment for her to confirm. Shows a card; nothing is recorded until she taps Confirm. Give the invoice id when the payment is for one invoice.",
  schema: z.object({
    customer_id: uuid,
    amount_aed: z.number().positive().max(10_000_000),
    method: z.enum(["cash", "card", "bank_transfer", "cheque"]),
    invoice_id: uuid.nullable().optional(),
    reference: z.string().max(120).nullable().optional(),
  }),
  json: {
    type: "object",
    properties: {
      customer_id: { type: "string" },
      amount_aed: { type: "number" },
      method: { type: "string", enum: ["cash", "card", "bank_transfer", "cheque"] },
      invoice_id: { type: ["string", "null"] },
      reference: { type: ["string", "null"], description: "Transfer or cheque reference" },
    },
    required: ["customer_id", "amount_aed", "method"],
    additionalProperties: false,
  },
  run: async (p) => {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, p.customer_id) });
    if (!c) return { result: { error: "No customer with that id." } };
    let invoiceNumber: string | null = null;
    if (p.invoice_id) {
      const [inv] = rows(await db.execute<{ number: string }>(sql`select number from invoices where id = ${p.invoice_id} and customer_id = ${c.id}`));
      if (!inv) return { result: { error: "That invoice is not this customer's." } };
      invoiceNumber = inv.number;
    }
    const card: Card = { kind: "payment", customerId: c.id, customerName: c.name, amount: Math.round(p.amount_aed * 100), method: p.method, invoiceId: p.invoice_id ?? null, invoiceNumber, reference: p.reference ?? null };
    return { result: { prepared: true, waitingForHerTap: true }, card };
  },
});

const prepareAssign = def({
  name: "prepare_assignment",
  description: "Prepare giving an unfinished workshop task to a different tailor. Shows a card; nothing changes until she taps Confirm. Get ids from list_tasks and team.",
  schema: z.object({ task_id: uuid, tailor_id: uuid }),
  json: { type: "object", properties: { task_id: { type: "string" }, tailor_id: { type: "string" } }, required: ["task_id", "tailor_id"], additionalProperties: false },
  run: async ({ task_id, tailor_id }) => {
    const [t] = rows(
      await db.execute<{ status: string; description: string; qty: number; number: string | null }>(sql`
        select t.status, l.description, t.qty, o.number from tasks t join so_lines l on l.id = t.so_line_id join sales_orders o on o.id = t.order_id where t.id = ${task_id}`),
    );
    const u = await db.query.users.findFirst({ where: and(eq(users.id, tailor_id), eq(users.isActive, true)) });
    if (!t || !u) return { result: { error: "Task or tailor not found." } };
    if (t.status === "submitted" || t.status === "approved") return { result: { error: "Finished work cannot be reassigned." } };
    return { result: { prepared: true, waitingForHerTap: true }, card: { kind: "assign", taskId: task_id, taskLabel: `${t.description}, ${t.qty} pieces, ${t.number ?? "draft"}`, tailorId: u.id, tailorName: u.name } };
  },
});

const prepareDraft = def({
  name: "prepare_draft",
  description: "Prepare a draft order or a quote for her to confirm. Lines are free text with quantity and price before VAT in AED. Shows a card; nothing is saved until she taps Confirm, and even then an order stays a draft for her to check.",
  schema: z.object({
    mode: z.enum(["order", "quote"]),
    customer_id: uuid,
    branch_id: uuid.nullable().optional(),
    customer_po_number: z.string().max(60).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    lines: z.array(z.object({ description: z.string().min(1).max(200), qty: z.number().int().min(1).max(100000), unit_price_aed: z.number().min(0).max(1_000_000) })).min(1).max(40),
  }),
  json: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["order", "quote"] },
      customer_id: { type: "string" },
      branch_id: { type: ["string", "null"] },
      customer_po_number: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      lines: {
        type: "array",
        items: { type: "object", properties: { description: { type: "string" }, qty: { type: "integer" }, unit_price_aed: { type: "number" } }, required: ["description", "qty", "unit_price_aed"], additionalProperties: false },
      },
    },
    required: ["mode", "customer_id", "lines"],
    additionalProperties: false,
  },
  run: async (d) => {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, d.customer_id) });
    if (!c) return { result: { error: "No customer with that id." } };
    let branchName: string | null = null;
    if (d.branch_id) {
      const b = await db.query.customerBranches.findFirst({ where: and(eq(customerBranches.id, d.branch_id), eq(customerBranches.customerId, c.id)) });
      if (!b) return { result: { error: "That branch is not this customer's." } };
      branchName = b.name;
    }
    const card: Card = {
      kind: "draft", mode: d.mode, customerId: c.id, customerName: c.name, branchId: d.branch_id ?? null, branchName, customerPoNumber: d.customer_po_number ?? null, notes: d.notes ?? null,
      lines: d.lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: Math.round(l.unit_price_aed * 100) })),
    };
    return { result: { prepared: true, waitingForHerTap: true }, card };
  },
});

const prepareEmail = def({
  name: "prepare_statement_email",
  description: "Prepare an email to a customer with their statement of account attached, for example a payment reminder. Write the subject and body in her voice. Shows a card; nothing is sent until she taps Send.",
  schema: z.object({ customer_id: uuid, to: z.string().email().nullable().optional(), subject: z.string().min(3).max(200), body: z.string().min(10).max(4000) }),
  json: {
    type: "object",
    properties: {
      customer_id: { type: "string" },
      to: { type: ["string", "null"], description: "Email address, empty to use the one on the customer" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["customer_id", "subject", "body"],
    additionalProperties: false,
  },
  run: async (e) => {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, e.customer_id) });
    if (!c) return { result: { error: "No customer with that id." } };
    const to = e.to ?? c.email ?? "";
    return { result: { prepared: true, waitingForHerTap: true, to: to || "missing: she must type the address on the card" }, card: { kind: "email", customerId: c.id, customerName: c.name, to, subject: e.subject, body: e.body } };
  },
});

const draftMessage = def({
  name: "draft_message",
  description: "Show a ready to send message (WhatsApp, email text or plain text) to a customer, supplier or tailor, with buttons to copy it or open WhatsApp. Nothing is sent by you.",
  schema: z.object({ channel: z.enum(["whatsapp", "email", "text"]), to_name: z.string().min(1).max(120), phone: z.string().max(30).nullable().optional(), text: z.string().min(2).max(4000) }),
  json: {
    type: "object",
    properties: {
      channel: { type: "string", enum: ["whatsapp", "email", "text"] },
      to_name: { type: "string" },
      phone: { type: ["string", "null"], description: "Their phone if known, for WhatsApp" },
      text: { type: "string" },
    },
    required: ["channel", "to_name", "text"],
    additionalProperties: false,
  },
  run: async (m) => ({ result: { shown: true }, card: { kind: "message", channel: m.channel, toName: m.to_name, phone: m.phone ?? null, text: m.text } }),
});

export const TOOLS = [findCustomers, customerSummary, searchOrders, getOrder, runReport, tailorOutput, listTasks, team, fabricStock, moneyNow, navigate, preparePayment, prepareAssign, prepareDraft, prepareEmail, draftMessage];

/** Definitions for the API, in a fixed order so the cached prefix never changes. */
export const TOOL_PARAMS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.json, eager_input_streaming: true }));

/** Runs one tool call. Input is untrusted: it is checked against the schema first, and failures go back to the model. */
export async function runTool(name: string, input: unknown, ctx: { userId: string }): Promise<ToolOutcome & { isError?: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { result: { error: `Unknown tool ${name}` }, isError: true };
  const parsed = (tool.schema as z.ZodTypeAny).safeParse(input);
  if (!parsed.success) return { result: { error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, isError: true };
  try {
    return await (tool.run as (i: unknown, c: { userId: string }) => Promise<ToolOutcome>)(parsed.data, ctx);
  } catch (e) {
    console.error("fiesta tool failed", name, e);
    return { result: { error: "That lookup failed. Try a different way." }, isError: true };
  }
}

export const TOOL_LABEL: Record<string, string> = {
  find_customers: "Looking up customers",
  customer_summary: "Reading the customer",
  search_orders: "Looking through orders",
  get_order: "Opening the order",
  run_report: "Running the report",
  tailor_output: "Counting the workshop's pieces",
  list_tasks: "Checking the workshop",
  team: "Checking the team",
  fabric_stock: "Checking fabric",
  money_now: "Checking the money",
  navigate: "Opening the page",
  prepare_payment: "Preparing the payment",
  prepare_assignment: "Preparing the change",
  prepare_draft: "Preparing the draft",
  prepare_statement_email: "Writing the email",
  draft_message: "Writing the message",
};

export const dateHint = () => {
  const today = todayISO();
  return { today, weekAgo: addDaysISO(today, -6), monthStart: `${today.slice(0, 7)}-01` };
};
