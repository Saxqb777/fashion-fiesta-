import { renderToBuffer, Text, View } from "@react-pdf/renderer";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditNoteLines,
  creditNotes,
  customerBranches,
  customers,
  deliveryNoteLines,
  deliveryNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  quoteLines,
  quotes,
  salesOrders,
  soLines,
} from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/dates";
import { agingByCustomer, invoiceFigures, METHOD_LABEL, statementLedger } from "@/lib/ledger";
import { getSettings } from "@/lib/settings";
import type { ShareType } from "@/lib/share";
import { aed, C, day, DocShell, LinesTable, Meta, Party, s, Totals, type Company } from "./template";

type Built = { element: React.ReactElement; filename: string; customerName: string; customerPhone: string | null; summary: string };

async function company(): Promise<Company & { vatRateBp: number; defaultCreditDays: number }> {
  const st = await getSettings();
  return st;
}

async function party(customerId: string, branchId: string | null) {
  const [c, b] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, customerId) }),
    branchId ? db.query.customerBranches.findFirst({ where: eq(customerBranches.id, branchId) }) : undefined,
  ]);
  return {
    name: c?.name ?? "Customer",
    phone: b?.phone ?? c?.phone ?? null,
    lines: [b ? `Branch: ${b.name}` : null, b?.address ?? c?.address, b?.contactName ? `Attn: ${b.contactName}` : null, c?.phone, c?.trn ? `TRN ${c.trn}` : null],
    creditDays: c?.creditDays ?? null,
    type: c?.type ?? "retail",
  };
}

const LINE_COLUMNS = [
  { title: "Description", flex: 4.2 },
  { title: "Qty", flex: 0.8, align: "right" as const },
  { title: "Unit price", flex: 1.4, align: "right" as const },
  { title: "VAT 5%", flex: 1.2, align: "right" as const },
  { title: "Line total", flex: 1.5, align: "right" as const },
];

function lineRows(lines: { description: string; qty: number; unitPriceFils: number; vatFils: number; netFils: number }[]) {
  return lines.map((l) => [l.description, String(l.qty), aed(l.unitPriceFils), aed(l.vatFils), aed(l.netFils + l.vatFils)]);
}

function termsFor(creditDays: number | null, type: string, defaultDays: number) {
  const days = creditDays ?? (type === "wholesale" ? defaultDays : 0);
  return days ? `Payment terms: ${days} days from the invoice date. All amounts in AED.` : "Payment terms: due on receipt. All amounts in AED.";
}

/* ---------- Quote ---------- */
async function quoteDoc(id: string): Promise<Built | null> {
  const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!q) return null;
  const [co, p, lines] = await Promise.all([company(), party(q.customerId, q.branchId), db.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).orderBy(asc(quoteLines.sort))]);
  return {
    filename: `${q.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Quote ${q.number} for AED ${aed(q.totalFils)}${q.validUntil ? `, valid until ${day(q.validUntil)}` : ""}`,
    element: (
      <DocShell title="Quote" subtitle={q.number} company={co} terms={`Prices include VAT where shown. ${q.validUntil ? `Valid until ${day(q.validUntil)}.` : ""}`}>
        <View style={s.row}>
          <Party label="Prepared for" name={p.name} lines={p.lines} />
          <Meta rows={[["Quote", q.number], ["Date", day(q.quoteDate)], ["Valid until", day(q.validUntil)]]} />
        </View>
        <LinesTable columns={LINE_COLUMNS} rows={lineRows(lines)} />
        <Totals rows={[["Subtotal", aed(q.subtotalFils)], ["VAT 5%", aed(q.vatFils)]]} grand={["Total AED", aed(q.totalFils)]} />
        {q.notes ? <Text style={s.note}>{q.notes}</Text> : null}
      </DocShell>
    ),
  };
}

/* ---------- Order confirmation ---------- */
async function orderDoc(id: string): Promise<Built | null> {
  const o = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) });
  if (!o || !o.number) return null;
  const [co, p, lines, deposits] = await Promise.all([
    company(),
    party(o.customerId, o.branchId),
    db.select().from(soLines).where(eq(soLines.orderId, id)).orderBy(asc(soLines.sort)),
    db.select({ n: sql<number>`coalesce(sum(${payments.amountFils}),0)::int` }).from(payments).where(and(eq(payments.orderId, id), eq(payments.isDeposit, true))),
  ]);
  const paid = deposits[0]?.n ?? 0;
  return {
    filename: `${o.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Order confirmation ${o.number} for AED ${aed(o.totalFils)}${o.dueDate ? `, ready by ${day(o.dueDate)}` : ""}`,
    element: (
      <DocShell title="Order Confirmation" subtitle={o.number} company={co} terms="All amounts in AED. The Tax Invoice follows on delivery.">
        <View style={s.row}>
          <Party label="Customer" name={p.name} lines={p.lines} />
          <Meta rows={[["Order", o.number], ["Date", day(o.orderDate)], ["Ready by", day(o.dueDate)], ["Customer PO", o.customerPoNumber]]} />
        </View>
        <LinesTable columns={LINE_COLUMNS} rows={lineRows(lines)} />
        <Totals
          rows={[["Subtotal", aed(o.subtotalFils)], ["VAT 5%", aed(o.vatFils)]]}
          grand={["Total AED", aed(o.totalFils)]}
          after={paid ? [["Paid in advance", aed(paid)], ["Balance on delivery", aed(o.totalFils - paid), true]] : undefined}
        />
        {o.notes ? <Text style={s.note}>{o.notes}</Text> : null}
      </DocShell>
    ),
  };
}

/* ---------- Delivery note ---------- */
async function deliveryDoc(id: string): Promise<Built | null> {
  const d = await db.query.deliveryNotes.findFirst({ where: eq(deliveryNotes.id, id) });
  if (!d) return null;
  const [co, p, lines, order] = await Promise.all([
    company(),
    party(d.customerId, d.branchId),
    db.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id)),
    db.query.salesOrders.findFirst({ where: eq(salesOrders.id, d.orderId), columns: { number: true } }),
  ]);
  return {
    filename: `${d.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Delivery note ${d.number}, ${lines.reduce((t, l) => t + l.qty, 0)} pieces`,
    element: (
      <DocShell title="Delivery Note" subtitle={d.number} company={co}>
        <View style={s.row}>
          <Party label="Deliver to" name={p.name} lines={p.lines} />
          <Meta rows={[["Delivery note", d.number], ["Date", day(d.deliveryDate)], ["Our order", order?.number], ["Customer PO", d.customerPoNumber]]} />
        </View>
        <LinesTable columns={[{ title: "Description", flex: 6 }, { title: "Qty", flex: 1, align: "right" }]} rows={lines.map((l) => [l.description, String(l.qty)])} />
        <View style={[s.row, { marginTop: 10 }]}>
          <Text style={s.muted}>Total pieces</Text>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 13 }}>{lines.reduce((t, l) => t + l.qty, 0)}</Text>
        </View>
        {d.notes ? <Text style={s.note}>{d.notes}</Text> : null}
        <View style={[s.row, { marginTop: 36 }]} wrap={false}>
          {["Received by", "Signature", "Date"].map((k) => (
            <View key={k} style={{ width: 150 }}>
              <View style={{ borderBottomWidth: 0.75, borderBottomColor: C.ink, height: 26 }} />
              <Text style={[s.label, { marginTop: 4 }]}>{k}</Text>
            </View>
          ))}
        </View>
      </DocShell>
    ),
  };
}

/* ---------- Tax invoice ---------- */
async function invoiceDoc(id: string): Promise<Built | null> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.kind !== "tax_invoice" || !inv.number) return null;
  const [co, p, lines, figures, order] = await Promise.all([
    company(),
    party(inv.customerId, inv.branchId),
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sort)),
    invoiceFigures([id]),
    inv.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, inv.orderId), columns: { number: true } }) : undefined,
  ]);
  const f = figures.get(id)!;
  const after: [string, string, boolean?][] = [];
  if (f.advanceFils) after.push(["Paid in advance", aed(f.advanceFils)]);
  if (f.paidFils - f.advanceFils) after.push(["Amount paid", aed(f.paidFils - f.advanceFils)]);
  if (f.creditedFils) after.push(["Credit notes", aed(f.creditedFils)]);
  after.push(["Balance due", aed(Math.max(0, f.balanceFils)), f.balanceFils > 0]);
  return {
    filename: `${inv.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Tax Invoice ${inv.number} for AED ${aed(inv.totalFils)}${f.balanceFils > 0 ? `, AED ${aed(f.balanceFils)} due by ${day(inv.dueDate)}` : ", paid in full"}`,
    element: (
      <DocShell title="Tax Invoice" subtitle={inv.number} company={co} terms={termsFor(p.creditDays, p.type, co.defaultCreditDays)}>
        <View style={s.row}>
          <Party label="Bill to" name={p.name} lines={p.lines} />
          <Meta
            rows={[
              ["Invoice", inv.number],
              ["Invoice date", day(inv.invoiceDate)],
              ["Due date", day(inv.dueDate)],
              ["Customer PO", inv.customerPoNumber],
              ["Our order", order?.number],
              ["Supplier TRN", co.trn],
            ]}
          />
        </View>
        <LinesTable columns={LINE_COLUMNS} rows={lineRows(lines)} />
        <Totals rows={[["Subtotal", aed(inv.subtotalFils)], [`VAT ${co.vatRateBp / 100}%`, aed(inv.vatFils)]]} grand={["Total AED", aed(inv.totalFils)]} after={after} />
        {inv.notes ? <Text style={s.note}>{inv.notes}</Text> : null}
      </DocShell>
    ),
  };
}

/* ---------- Credit note ---------- */
async function creditDoc(id: string): Promise<Built | null> {
  const cn = await db.query.creditNotes.findFirst({ where: eq(creditNotes.id, id) });
  if (!cn) return null;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, cn.invoiceId) });
  const [co, p, lines] = await Promise.all([company(), party(cn.customerId, inv?.branchId ?? null), db.select().from(creditNoteLines).where(eq(creditNoteLines.creditNoteId, id))]);
  return {
    filename: `${cn.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Credit note ${cn.number} for AED ${aed(cn.totalFils)} against Tax Invoice ${inv?.number ?? ""}`,
    element: (
      <DocShell title="Tax Credit Note" subtitle={cn.number} company={co} terms="This credit reduces the amount due on the invoice shown. All amounts in AED.">
        <View style={s.row}>
          <Party label="Customer" name={p.name} lines={p.lines} />
          <Meta rows={[["Credit note", cn.number], ["Date", day(cn.creditDate)], ["Against invoice", inv?.number], ["Invoice date", day(inv?.invoiceDate)], ["Supplier TRN", co.trn]]} />
        </View>
        <Text style={s.note}>Reason: {cn.reason}</Text>
        <LinesTable columns={LINE_COLUMNS} rows={lineRows(lines)} />
        <Totals rows={[["Subtotal", aed(cn.subtotalFils)], ["VAT 5%", aed(cn.vatFils)]]} grand={["Total credited AED", aed(cn.totalFils)]} />
      </DocShell>
    ),
  };
}

/* ---------- Receipt ---------- */
async function receiptDoc(id: string): Promise<Built | null> {
  const pay = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!pay) return null;
  const [co, p, allocs, order] = await Promise.all([
    company(),
    party(pay.customerId, null),
    db
      .select({ amount: paymentAllocations.amountFils, number: invoices.number, kind: invoices.kind, date: invoices.invoiceDate })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, id)),
    pay.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, pay.orderId), columns: { number: true } }) : undefined,
  ]);
  const applied = allocs.reduce((t, a) => t + a.amount, 0);
  const left = pay.amountFils - applied;
  return {
    filename: `${pay.number}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Receipt ${pay.number}: AED ${aed(pay.amountFils)} received with thanks`,
    element: (
      <DocShell title="Receipt" subtitle={pay.number} company={co}>
        <View style={s.row}>
          <Party label="Received from" name={p.name} lines={p.lines} />
          <Meta rows={[["Receipt", pay.number], ["Date", day(pay.paymentDate)], ["Method", METHOD_LABEL[pay.method]], ["Reference", pay.reference], ["Order", order?.number]]} />
        </View>
        <View style={{ marginTop: 18, backgroundColor: C.paper, borderRadius: 12, padding: 16 }}>
          <Text style={s.label}>Amount received</Text>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 30 }}>AED {aed(pay.amountFils)}</Text>
        </View>
        {allocs.length ? (
          <LinesTable
            columns={[{ title: "Applied to", flex: 4 }, { title: "Date", flex: 1.6 }, { title: "Amount", flex: 1.6, align: "right" }]}
            rows={allocs.map((a) => [a.kind === "opening_balance" ? "Opening balance" : `Tax Invoice ${a.number}`, day(a.date), aed(a.amount)])}
          />
        ) : null}
        {left > 0 ? (
          <Text style={s.note}>{pay.isDeposit ? `AED ${aed(left)} is held as a deposit for order ${order?.number ?? ""} and will be applied to its invoice.` : `AED ${aed(left)} is held as credit on your account.`}</Text>
        ) : null}
      </DocShell>
    ),
  };
}

/* ---------- Statement of account ---------- */
async function statementDoc(customerId: string, from?: string, to?: string): Promise<Built | null> {
  const c = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!c) return null;
  const end = to ?? todayISO();
  const start = from ?? addDaysISO(end, -90);
  const [co, p, ledger, aging] = await Promise.all([company(), party(customerId, null), statementLedger(customerId, start, end), agingByCustomer(customerId)]);
  const { opening, closing: running } = ledger;
  const rows = ledger.rows.map((e) => [day(e.date), e.doc, e.text, e.debit ? aed(e.debit) : "", e.credit ? aed(e.credit) : "", aed(e.balance)]);
  const a = aging[0];
  const buckets: [string, number][] = [
    ["Not due", a?.notDue ?? 0],
    ["1 to 30 days", a?.d1_30 ?? 0],
    ["31 to 60 days", a?.d31_60 ?? 0],
    ["Over 60 days", a?.d61 ?? 0],
  ];
  return {
    filename: `Statement ${c.name} ${end}.pdf`,
    customerName: p.name,
    customerPhone: p.phone,
    summary: `Statement of account to ${day(end)}: balance AED ${aed(running)}`,
    element: (
      <DocShell title="Statement of Account" subtitle={`${day(start)} to ${day(end)}`} company={co} terms={termsFor(c.creditDays, c.type, co.defaultCreditDays)}>
        <View style={s.row}>
          <Party label="Customer" name={p.name} lines={p.lines} />
          <Meta rows={[["From", day(start)], ["To", day(end)], ["Opening balance", `AED ${aed(opening)}`]]} />
        </View>
        <LinesTable
          columns={[
            { title: "Date", flex: 1.3 },
            { title: "Document", flex: 1.4 },
            { title: "Details", flex: 3.2 },
            { title: "Charges", flex: 1.3, align: "right" },
            { title: "Payments", flex: 1.3, align: "right" },
            { title: "Balance", flex: 1.4, align: "right" },
          ]}
          rows={[[day(start), "", "Balance brought forward", "", "", aed(opening)], ...rows]}
        />
        <View style={[s.row, { marginTop: 16 }]} wrap={false}>
          {buckets.map(([k, v], i) => (
            <View key={k} style={{ flex: 1, marginRight: i < 3 ? 8 : 0, borderWidth: 0.75, borderColor: i === 3 && v > 0 ? C.brand : C.line, borderRadius: 10, padding: 9 }}>
              <Text style={s.label}>{k}</Text>
              <Text style={{ fontWeight: 700, fontSize: 11, color: i === 3 && v > 0 ? C.brandDeep : C.ink }}>{aed(v)}</Text>
            </View>
          ))}
        </View>
        <Totals rows={[]} grand={[running >= 0 ? "Balance due AED" : "In your favour AED", aed(Math.abs(running))]} />
      </DocShell>
    ),
  };
}

export async function buildDoc(type: ShareType, id: string, opts: { from?: string; to?: string } = {}): Promise<Built | null> {
  switch (type) {
    case "quote":
      return quoteDoc(id);
    case "order":
      return orderDoc(id);
    case "delivery":
      return deliveryDoc(id);
    case "invoice":
      return invoiceDoc(id);
    case "credit":
      return creditDoc(id);
    case "receipt":
      return receiptDoc(id);
    case "statement":
      return statementDoc(id, opts.from, opts.to);
  }
}

export async function renderDoc(type: ShareType, id: string, opts: { from?: string; to?: string } = {}) {
  const built = await buildDoc(type, id, opts);
  if (!built) return null;
  const buffer = await renderToBuffer(built.element as Parameters<typeof renderToBuffer>[0]);
  return { buffer, ...built };
}

export function pdfResponse(buffer: Buffer, filename: string, download = false) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

