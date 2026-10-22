import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditNotes, customers, invoices, paymentAllocations, payments } from "@/db/schema";
import { addDaysISO, formatISODate, todayISO } from "./dates";
import { getSettings } from "./settings";

export type InvoiceFigures = { totalFils: number; creditedFils: number; paidFils: number; advanceFils: number; balanceFils: number };

/** Total, credit notes, payments (and the part paid in advance) and balance for each invoice. */
export async function invoiceFigures(ids: string[]): Promise<Map<string, InvoiceFigures>> {
  const out = new Map<string, InvoiceFigures>();
  if (!ids.length) return out;
  const [inv, cn, al] = await Promise.all([
    db.select({ id: invoices.id, total: invoices.totalFils }).from(invoices).where(inArray(invoices.id, ids)),
    db
      .select({ id: creditNotes.invoiceId, n: sql<number>`coalesce(sum(${creditNotes.totalFils}),0)::int` })
      .from(creditNotes)
      .where(inArray(creditNotes.invoiceId, ids))
      .groupBy(creditNotes.invoiceId),
    db
      .select({
        id: paymentAllocations.invoiceId,
        paid: sql<number>`coalesce(sum(${paymentAllocations.amountFils}),0)::int`,
        advance: sql<number>`coalesce(sum(case when ${payments.isDeposit} then ${paymentAllocations.amountFils} else 0 end),0)::int`,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(inArray(paymentAllocations.invoiceId, ids))
      .groupBy(paymentAllocations.invoiceId),
  ]);
  for (const i of inv) {
    const credited = cn.find((c) => c.id === i.id)?.n ?? 0;
    const a = al.find((x) => x.id === i.id);
    const paid = a?.paid ?? 0;
    out.set(i.id, { totalFils: i.total, creditedFils: credited, paidFils: paid, advanceFils: a?.advance ?? 0, balanceFils: i.total - credited - paid });
  }
  return out;
}

export type InvoiceStatus = "paid" | "credited" | "part_paid" | "overdue" | "unpaid";

export function invoiceStatus(f: InvoiceFigures, dueDate: string, today = todayISO()): InvoiceStatus {
  if (f.balanceFils <= 0) return f.creditedFils >= f.totalFils && f.totalFils > 0 ? "credited" : "paid";
  if (dueDate < today) return "overdue";
  if (f.paidFils > 0 || f.creditedFils > 0) return "part_paid";
  return "unpaid";
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  credited: "Credited",
  part_paid: "Part paid",
  overdue: "Overdue",
  unpaid: "Unpaid",
};

/** Money a customer paid that is not yet set against an invoice: credit on account or an open deposit. */
export async function unallocatedByPayment(paymentIds: string[]) {
  const out = new Map<string, number>();
  if (!paymentIds.length) return out;
  const rows = await db
    .select({
      id: payments.id,
      left: sql<number>`(${payments.amountFils} - coalesce((select sum(a.amount_fils) from payment_allocations a where a.payment_id = payments.id),0))::int`,
    })
    .from(payments)
    .where(inArray(payments.id, paymentIds));
  for (const r of rows) out.set(r.id, r.left);
  return out;
}

export type AgingRow = {
  customerId: string;
  name: string;
  tier: "vip" | "regular" | "new";
  phone: string | null;
  notDue: number;
  d1_30: number;
  d31_60: number;
  d61: number;
  owed: number;
  credit: number;
  oldestDue: string | null;
};

/** Who owes you, aged by how late each open invoice is. */
export async function agingByCustomer(customerId?: string): Promise<AgingRow[]> {
  const today = todayISO();
  const result = await db.execute<{
    customer_id: string;
    name: string;
    tier: AgingRow["tier"];
    phone: string | null;
    not_due: number;
    d1_30: number;
    d31_60: number;
    d61: number;
    owed: number;
    credit: number;
    oldest_due: string | null;
  }>(sql`
    with bal as (
      select i.customer_id, i.due_date,
        i.total_fils
          - coalesce((select sum(c.total_fils) from credit_notes c where c.invoice_id = i.id), 0)
          - coalesce((select sum(a.amount_fils) from payment_allocations a where a.invoice_id = i.id), 0) as balance
      from invoices i
      ${customerId ? sql`where i.customer_id = ${customerId}` : sql``}
    ),
    open as (select * from bal where balance > 0),
    credit as (
      select p.customer_id, sum(p.amount_fils - coalesce((select sum(a.amount_fils) from payment_allocations a where a.payment_id = p.id), 0)) as credit
      from payments p group by p.customer_id
    )
    select c.id as customer_id, c.name, c.tier, c.phone,
      coalesce(sum(case when o.due_date >= ${today} then o.balance end), 0)::int as not_due,
      coalesce(sum(case when o.due_date < ${today} and o.due_date >= (${today}::date - 30) then o.balance end), 0)::int as d1_30,
      coalesce(sum(case when o.due_date < (${today}::date - 30) and o.due_date >= (${today}::date - 60) then o.balance end), 0)::int as d31_60,
      coalesce(sum(case when o.due_date < (${today}::date - 60) then o.balance end), 0)::int as d61,
      coalesce(sum(o.balance), 0)::int as owed,
      coalesce(max(cr.credit), 0)::int as credit,
      min(o.due_date)::text as oldest_due
    from customers c
    left join open o on o.customer_id = c.id
    left join credit cr on cr.customer_id = c.id
    where (o.customer_id is not null or cr.credit > 0) ${customerId ? sql`and c.id = ${customerId}` : sql``}
    group by c.id
    order by case c.tier when 'vip' then 0 when 'regular' then 1 else 2 end, owed desc
  `);
  return result.rows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    tier: r.tier,
    phone: r.phone,
    notDue: Number(r.not_due),
    d1_30: Number(r.d1_30),
    d31_60: Number(r.d31_60),
    d61: Number(r.d61),
    owed: Number(r.owed),
    credit: Number(r.credit),
    oldestDue: r.oldest_due,
  }));
}

/** Due date: invoice date plus the customer's credit days. Retail without credit days is due on the day. */
export async function dueDateFor(customerId: string, invoiceDate: string) {
  const [customer, settings] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { creditDays: true, type: true } }),
    getSettings(),
  ]);
  const days = customer?.creditDays ?? (customer?.type === "wholesale" ? settings.defaultCreditDays : 0);
  return addDaysISO(invoiceDate, days);
}

export async function openInvoicesFor(customerId: string) {
  const rows = await db
    .select({ id: invoices.id, number: invoices.number, kind: invoices.kind, invoiceDate: invoices.invoiceDate, dueDate: invoices.dueDate })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId)))
    .orderBy(invoices.dueDate, invoices.createdAt);
  const figures = await invoiceFigures(rows.map((r) => r.id));
  return rows
    .map((r) => ({ ...r, ...figures.get(r.id)! }))
    .filter((r) => r.balanceFils > 0);
}

export const METHOD_LABEL = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque" } as const;

export type StatementEntry = { date: string; doc: string; text: string; debit: number; credit: number; balance: number; href: string };

/** Everything that moved a customer's balance, oldest first, with a running balance. Used by the page and the PDF. */
export async function statementLedger(customerId: string, start: string, end: string) {
  const [invs, cns, pays] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.customerId, customerId), lte(invoices.invoiceDate, end))),
    db.select().from(creditNotes).where(and(eq(creditNotes.customerId, customerId), lte(creditNotes.creditDate, end))),
    db.select().from(payments).where(and(eq(payments.customerId, customerId), lte(payments.paymentDate, end))),
  ]);
  const all = [
    ...invs.map((i) => ({
      date: i.invoiceDate,
      doc: i.number ?? "",
      text: i.kind === "opening_balance" ? "Balance from previous records" : `Tax Invoice, due ${formatISODate(i.dueDate, true)}`,
      debit: i.totalFils,
      credit: 0,
      href: `/money/invoices/${i.id}`,
    })),
    ...cns.map((n) => ({ date: n.creditDate, doc: n.number, text: `Credit note: ${n.reason}`, debit: 0, credit: n.totalFils, href: `/money/invoices/${n.invoiceId}` })),
    ...pays.map((x) => ({
      date: x.paymentDate,
      doc: x.number,
      text: `Payment, ${METHOD_LABEL[x.method].toLowerCase()}${x.isDeposit ? ", deposit" : ""}`,
      debit: 0,
      credit: x.amountFils,
      href: `/money/payments/${x.id}`,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.debit - a.debit));
  const opening = all.filter((e) => e.date < start).reduce((t, e) => t + e.debit - e.credit, 0);
  let running = opening;
  const rows: StatementEntry[] = all
    .filter((e) => e.date >= start)
    .map((e) => {
      running += e.debit - e.credit;
      return { ...e, balance: running };
    });
  return { opening, rows, closing: running };
}

/** For Today: overdue invoices and those falling due in the next 7 days. */
export async function dueSummary() {
  const today = todayISO();
  const week = addDaysISO(today, 7);
  const result = await db.execute<{ overdue_n: number; overdue: number; week_n: number; week: number }>(sql`
    with bal as (
      select i.due_date,
        i.total_fils
          - coalesce((select sum(c.total_fils) from credit_notes c where c.invoice_id = i.id), 0)
          - coalesce((select sum(a.amount_fils) from payment_allocations a where a.invoice_id = i.id), 0) as balance
      from invoices i
    )
    select
      count(*) filter (where balance > 0 and due_date < ${today})::int as overdue_n,
      coalesce(sum(balance) filter (where balance > 0 and due_date < ${today}), 0)::int as overdue,
      count(*) filter (where balance > 0 and due_date >= ${today} and due_date <= ${week})::int as week_n,
      coalesce(sum(balance) filter (where balance > 0 and due_date >= ${today} and due_date <= ${week}), 0)::int as week
    from bal
  `);
  const r = result.rows[0];
  return { overdueCount: Number(r?.overdue_n ?? 0), overdueFils: Number(r?.overdue ?? 0), weekCount: Number(r?.week_n ?? 0), weekFils: Number(r?.week ?? 0) };
}
