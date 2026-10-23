import { sql } from "drizzle-orm";
import { db } from "@/db";
import { agingByCustomer } from "./ledger";
import { customerHealth } from "./health";
import { addDaysISO } from "./dates";

/** One table, shown on screen and downloaded as Excel from the same data. */
export type Column = { key: string; title: string; kind?: "money" | "number" | "percent" | "date" | "text" };
export type Table = { title: string; columns: Column[]; rows: Record<string, string | number | null>[]; totals?: Record<string, string | number | null> };

const n = (v: unknown) => Number(v ?? 0);
const monthKey = (iso: string) => iso.slice(0, 7);
export const monthName = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export function lastMonths(today: string, count: number) {
  const out: string[] = [];
  let [y, m] = today.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/* ---------- Who owes you ---------- */

export async function owesReport(): Promise<Table> {
  const rows = (await agingByCustomer()).filter((r) => r.owed > 0);
  const sum = (k: "notDue" | "d1_30" | "d31_60" | "d61" | "owed") => rows.reduce((s, r) => s + r[k], 0);
  return {
    title: "Who owes you",
    columns: [
      { key: "name", title: "Customer" },
      { key: "notDue", title: "Not due yet", kind: "money" },
      { key: "d1_30", title: "1 to 30 days late", kind: "money" },
      { key: "d31_60", title: "31 to 60 days late", kind: "money" },
      { key: "d61", title: "Over 60 days late", kind: "money" },
      { key: "owed", title: "Total", kind: "money" },
    ],
    rows: rows.map((r) => ({ name: r.name, notDue: r.notDue, d1_30: r.d1_30, d31_60: r.d31_60, d61: r.d61, owed: r.owed })),
    totals: { name: "Total", notDue: sum("notDue"), d1_30: sum("d1_30"), d31_60: sum("d31_60"), d61: sum("d61"), owed: sum("owed") },
  };
}

/* ---------- Sales ---------- */

/** Net of VAT. Tax invoices less credit notes, plus quick sales. Opening balances are not sales. */
export async function salesByMonth(today: string): Promise<Table> {
  const months = lastMonths(today, 12);
  const from = `${months[0]}-01`;
  const res = await db.execute<{ ym: string; invoiced: number; credited: number; counter: number }>(sql`
    with m as (
      select to_char(invoice_date, 'YYYY-MM') ym, sum(subtotal_fils) invoiced, 0 credited, 0 counter from invoices where kind = 'tax_invoice' and invoice_date >= ${from} group by 1
      union all
      select to_char(credit_date, 'YYYY-MM'), 0, sum(subtotal_fils), 0 from credit_notes where credit_date >= ${from} group by 1
      union all
      select to_char(sale_date, 'YYYY-MM'), 0, 0, sum(subtotal_fils) from pos_sales where sale_date >= ${from} group by 1
    )
    select ym, sum(invoiced)::int invoiced, sum(credited)::int credited, sum(counter)::int counter from m group by ym`);
  const rows = months.map((ym) => {
    const r = res.rows.find((x) => x.ym === ym);
    const invoiced = n(r?.invoiced) - n(r?.credited);
    return { month: monthName(ym), invoiced, counter: n(r?.counter), total: invoiced + n(r?.counter) };
  });
  return {
    title: "Sales by month, before VAT",
    columns: [
      { key: "month", title: "Month" },
      { key: "invoiced", title: "Invoiced", kind: "money" },
      { key: "counter", title: "Quick sales", kind: "money" },
      { key: "total", title: "Total", kind: "money" },
    ],
    rows,
    totals: { month: "12 months", invoiced: rows.reduce((s, r) => s + r.invoiced, 0), counter: rows.reduce((s, r) => s + r.counter, 0), total: rows.reduce((s, r) => s + r.total, 0) },
  };
}

export async function salesByCustomer(today: string): Promise<Table> {
  const year = today.slice(0, 4);
  const res = await db.execute<{ name: string; invoices: number; net: number; vat: number }>(sql`
    select c.name, count(*)::int invoices, sum(i.subtotal_fils)::int net, sum(i.vat_fils)::int vat
    from invoices i join customers c on c.id = i.customer_id
    where i.kind = 'tax_invoice' and to_char(i.invoice_date, 'YYYY') = ${year}
    group by c.name order by net desc`);
  const total = res.rows.reduce((s, r) => s + n(r.net), 0);
  return {
    title: `Sales by customer, ${year}`,
    columns: [
      { key: "name", title: "Customer" },
      { key: "invoices", title: "Invoices", kind: "number" },
      { key: "net", title: "Before VAT", kind: "money" },
      { key: "share", title: "Share", kind: "percent" },
    ],
    rows: res.rows.map((r) => ({ name: r.name, invoices: n(r.invoices), net: n(r.net), share: total ? Math.round((n(r.net) / total) * 1000) / 10 : 0 })),
    totals: { name: "Total", invoices: res.rows.reduce((s, r) => s + n(r.invoices), 0), net: total, share: total ? 100 : 0 },
  };
}

/* ---------- VAT ---------- */

export type VatPeriod = { start: string; end: string; label: string };

/** Quarters that begin in the start month from Settings. The latest is the one today falls in. */
export function vatPeriods(today: string, startMonth: number, count = 6): VatPeriod[] {
  let [y, m] = today.split("-").map(Number);
  // Step back to the quarter start on or before today.
  while ((m - startMonth + 12) % 3 !== 0) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const out: VatPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    let ey = y;
    let em = m + 2;
    if (em > 12) {
      em -= 12;
      ey += 1;
    }
    const end = monthEnd(`${ey}-${String(em).padStart(2, "0")}`);
    const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    out.push({ start, end, label: `${fmt(start)} to ${fmt(end)}` });
    m -= 3;
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
  }
  return out;
}

/** The return laid out like the FTA VAT 201 form. Built in lib/tax/vat.ts, kept here for the report tables. */
export async function vatReturn(p: VatPeriod) {
  const { vatPack } = await import("./tax/vat");
  const pack = await vatPack(p);
  return {
    boxes: pack.boxes.filter((b) => ["1a", "8", "9", "11", "12", "13", "14"].includes(b.box)).map((b) => ({ box: b.box, label: b.label, net: b.amount, vat: b.vat ?? 0 })),
    sales: pack.saleDocs.map(({ kind, ref, date, party, net, vat }) => ({ kind, ref, date, party, net, vat })),
    purchases: pack.purchaseDocs.filter((d) => d.claimable).map(({ kind, ref, date, party, net, vat }) => ({ kind, ref, date, party, net, vat })),
  };
}

export async function vatTables(p: VatPeriod): Promise<Table[]> {
  const { vatPack } = await import("./tax/vat");
  const pack = await vatPack(p);
  const docCols: Column[] = [
    { key: "date", title: "Date", kind: "date" },
    { key: "kind", title: "Document" },
    { key: "ref", title: "Number" },
    { key: "party", title: "Party" },
    { key: "emirate", title: "Emirate" },
    { key: "net", title: "Before VAT", kind: "money" },
    { key: "vat", title: "VAT", kind: "money" },
  ];
  const purchaseCols: Column[] = [
    { key: "date", title: "Date", kind: "date" },
    { key: "kind", title: "Document" },
    { key: "ref", title: "Number" },
    { key: "party", title: "Supplier or payee" },
    { key: "trn", title: "TRN" },
    { key: "net", title: "Before VAT", kind: "money" },
    { key: "vat", title: "VAT", kind: "money" },
  ];
  const strip = <T extends { id?: string; href?: string; claimable?: boolean }>(r: T) => {
    const { id: _id, href: _href, claimable: _c, ...rest } = r;
    void _id;
    void _href;
    void _c;
    return rest as Record<string, string | number | null>;
  };
  return [
    {
      title: `VAT return ${p.label}`,
      columns: [{ key: "box", title: "Box" }, { key: "label", title: "" }, { key: "amount", title: "Amount", kind: "money" }, { key: "vat", title: "VAT", kind: "money" }, { key: "adjustment", title: "Adjustment", kind: "money" }],
      rows: pack.boxes.map((b) => ({ box: b.box, label: b.label, amount: b.amount, vat: b.vat, adjustment: b.adjustment ?? null })),
    },
    { title: "Sales behind boxes 1a and 8", columns: docCols, rows: pack.saleDocs.map(strip) },
    { title: "Purchases behind boxes 9 and 11", columns: purchaseCols, rows: pack.purchaseDocs.filter((d) => d.claimable).map(strip) },
    { title: "VAT paid but not claimable", columns: purchaseCols, rows: pack.unclaimed.map(strip) },
  ];
}

/* ---------- Tailors: output and scorecard (idea 21) ---------- */

export async function tailorScorecard(today: string): Promise<Table> {
  const from30 = addDaysISO(today, -29);
  const from7 = addDaysISO(today, -6);
  const res = await db.execute<{ name: string; pieces7: number; pieces30: number; ontime: number; dated: number; approved_reviews: number; rejected_reviews: number }>(sql`
    select u.name,
      coalesce(sum(t.qty) filter (where t.status = 'approved' and t.approved_at::date >= ${from7}), 0)::int pieces7,
      coalesce(sum(t.qty) filter (where t.status = 'approved' and t.approved_at::date >= ${from30}), 0)::int pieces30,
      count(*) filter (where t.status = 'approved' and t.due_date is not null and t.approved_at::date >= ${from30} and t.approved_at::date <= t.due_date)::int ontime,
      count(*) filter (where t.status = 'approved' and t.due_date is not null and t.approved_at::date >= ${from30})::int dated,
      (select count(*) from task_reviews r join tasks x on x.id = r.task_id where x.tailor_id = u.id and r.decision = 'approved' and r.created_at::date >= ${from30})::int approved_reviews,
      (select count(*) from task_reviews r join tasks x on x.id = r.task_id where x.tailor_id = u.id and r.decision = 'rejected' and r.created_at::date >= ${from30})::int rejected_reviews
    from users u left join tasks t on t.tailor_id = u.id
    where u.role = 'tailor' and u.deleted_at is null and u.is_active
    group by u.id, u.name order by pieces30 desc, u.name`);
  return {
    title: "Tailors, last 30 days",
    columns: [
      { key: "name", title: "Tailor" },
      { key: "week", title: "Pieces this week", kind: "number" },
      { key: "month", title: "Pieces in 30 days", kind: "number" },
      { key: "perWeek", title: "Pieces a week", kind: "number" },
      { key: "onTime", title: "On time", kind: "percent" },
      { key: "rejection", title: "Sent back", kind: "percent" },
    ],
    rows: res.rows.map((r) => {
      const reviews = n(r.approved_reviews) + n(r.rejected_reviews);
      return {
        name: r.name,
        week: n(r.pieces7),
        month: n(r.pieces30),
        perWeek: Math.round((n(r.pieces30) / 30) * 7 * 10) / 10,
        onTime: n(r.dated) ? Math.round((n(r.ontime) / n(r.dated)) * 100) : null,
        rejection: reviews ? Math.round((n(r.rejected_reviews) / reviews) * 100) : null,
      };
    }),
  };
}

/* ---------- Monthly P&L (idea 19) ---------- */

/**
 * Sales less what they cost to make, less running costs, for one month.
 * Fabric counts when it is cut or sent, at its cost per metre. Purchases into stock are not costs yet.
 */
export async function profitAndLoss(ym: string) {
  const start = `${ym}-01`;
  const end = monthEnd(ym);
  const [[r]] = await Promise.all([
    db
      .execute<{
        invoiced: number;
        credited: number;
        counter: number;
        fabric: number;
        outsourcing: number;
        delivery: number;
        emb_income: number;
        emb_share: number;
        salaries: number;
        other: number;
      }>(sql`
      select
        (select coalesce(sum(subtotal_fils), 0) from invoices where kind = 'tax_invoice' and invoice_date between ${start} and ${end})::int invoiced,
        (select coalesce(sum(subtotal_fils), 0) from credit_notes where credit_date between ${start} and ${end})::int credited,
        (select coalesce(sum(subtotal_fils), 0) from pos_sales where sale_date between ${start} and ${end})::int counter,
        (select coalesce(sum(round(-m.qty_centi * f.cost_fils / 100.0)), 0) from stock_movements m join fabrics f on f.id = m.fabric_id
          where m.kind in ('taken', 'sent') and m.moved_on between ${start} and ${end})::int fabric,
        (select coalesce(sum(b.subtotal_fils), 0) from supplier_bills b join suppliers s on s.id = b.supplier_id
          where b.kind = 'bill' and s.type = 'outsourcing' and b.bill_date between ${start} and ${end})::int outsourcing,
        (select coalesce(sum(b.subtotal_fils), 0) from supplier_bills b join suppliers s on s.id = b.supplier_id
          where b.kind = 'bill' and s.type = 'delivery' and b.bill_date between ${start} and ${end})::int delivery,
        (select coalesce(sum(round(price_fils * shop_share_percent / 100.0)), 0) from embroidery_jobs
          where status = 'done' and side = 'operator' and done_at::date between ${start} and ${end})::int emb_income,
        (select coalesce(sum(price_fils - round(price_fils * shop_share_percent / 100.0)), 0) from embroidery_jobs
          where status = 'done' and side = 'shop' and done_at::date between ${start} and ${end})::int emb_share,
        (select coalesce(sum(e.amount_fils), 0) from expenses e join expense_categories c on c.id = e.category_id
          where c.name ilike 'salaries' and e.expense_date between ${start} and ${end})::int salaries,
        (select coalesce(sum(e.amount_fils - e.vat_fils), 0) from expenses e join expense_categories c on c.id = e.category_id
          where c.name not ilike 'salaries' and e.expense_date between ${start} and ${end})::int other`)
      .then((x) => x.rows),
  ]);
  const sales = n(r.invoiced) - n(r.credited) + n(r.counter);
  const income = sales + n(r.emb_income);
  const direct = n(r.fabric) + n(r.outsourcing) + n(r.emb_share);
  const gross = income - direct;
  const running = n(r.salaries) + n(r.other) + n(r.delivery);
  return {
    lines: [
      { label: "Sales, before VAT", amount: sales, kind: "in" as const },
      { label: "Embroidery, shop's share from the operator's customers", amount: n(r.emb_income), kind: "in" as const },
      { label: "Fabric used", amount: -n(r.fabric), kind: "cost" as const },
      { label: "Stitching units", amount: -n(r.outsourcing), kind: "cost" as const },
      { label: "Embroidery, operator's share", amount: -n(r.emb_share), kind: "cost" as const },
      { label: "Gross profit", amount: gross, kind: "subtotal" as const },
      { label: "Salaries", amount: -n(r.salaries), kind: "cost" as const },
      { label: "Delivery companies", amount: -n(r.delivery), kind: "cost" as const },
      { label: "Other expenses, before VAT", amount: -n(r.other), kind: "cost" as const },
      { label: "Operating profit", amount: gross - running, kind: "total" as const },
    ],
    margin: income ? Math.round(((gross - running) / income) * 1000) / 10 : null,
  };
}

export async function pnlTable(ym: string): Promise<Table> {
  const p = await profitAndLoss(ym);
  return { title: `Profit and loss, ${monthName(ym)}`, columns: [{ key: "label", title: "" }, { key: "amount", title: "AED", kind: "money" }], rows: p.lines.map((l) => ({ label: l.label, amount: l.amount })) };
}

/* ---------- Customers (idea 20) ---------- */

export async function customersTable(today: string, quietOnly = false): Promise<Table> {
  const cutoff = addDaysISO(today, -90);
  const rows = (await customerHealth(today)).filter((c) => c.lastOrder && (!quietOnly || c.lastOrder < cutoff));
  return {
    title: quietOnly ? "Customers who have not ordered for 90 days" : "Customers",
    columns: [
      { key: "name", title: "Customer" },
      { key: "lastOrder", title: "Last order", kind: "date" },
      { key: "yearFils", title: "Ordered this year", kind: "money" },
      { key: "avgDaysToPay", title: "Days to pay, average", kind: "number" },
    ],
    rows: rows.map((c) => ({ name: c.name, lastOrder: c.lastOrder, yearFils: c.yearFils, avgDaysToPay: c.avgDaysToPay })),
  };
}

export { monthKey };
