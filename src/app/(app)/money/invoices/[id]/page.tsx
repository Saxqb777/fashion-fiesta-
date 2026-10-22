import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRightIcon, MapPinIcon } from "lucide-react";
import { db } from "@/db";
import { creditNotes, customerBranches, customers, invoiceLines, paymentAllocations, payments, salesOrders } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Panel } from "@/components/data/detail";
import { RecentActivity } from "@/components/data/recent-activity";
import { TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { Celebrate } from "@/components/money/celebrate";
import { CountUp } from "@/components/money/count-up";
import { InvoiceStatusTag } from "@/components/money/bits";
import { SendDoc } from "@/components/money/send-doc";
import { DueChip } from "@/components/orders/bits";
import { formatISODate } from "@/lib/dates";
import { sendDocProps } from "@/lib/doc-links";
import { METHOD_LABEL, invoiceFigures, invoiceStatus } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const invoice = /^[0-9a-f-]{36}$/.test(id) ? await db.query.invoices.findFirst({ where: (t, { eq }) => eq(t.id, id) }) : undefined;
  if (!invoice) notFound();
  const isOpening = invoice.kind === "opening_balance";
  const [customer, branch, order, lines, paid, credits, figures, s] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId) }),
    invoice.branchId ? db.query.customerBranches.findFirst({ where: eq(customerBranches.id, invoice.branchId) }) : undefined,
    invoice.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, invoice.orderId), columns: { id: true, number: true } }) : undefined,
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sort)),
    db
      .select({ a: paymentAllocations, p: payments })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(paymentAllocations.invoiceId, id))
      .orderBy(asc(payments.paymentDate)),
    db.select().from(creditNotes).where(eq(creditNotes.invoiceId, id)).orderBy(desc(creditNotes.creditDate)),
    invoiceFigures([id]),
    getSettings(),
  ]);
  const f = figures.get(id)!;
  const status = invoiceStatus(f, invoice.dueDate);
  const send = isOpening
    ? null
    : await sendDocProps("invoice", id, {
        phone: customer?.phone,
        email: customer?.email,
        name: customer?.name,
        title: `Tax Invoice ${invoice.number}`,
        filename: `${invoice.number} ${customer?.name ?? ""}`,
        message: `${s.tradeName}: Tax Invoice ${invoice.number} for ${formatFils(invoice.totalFils)}${f.balanceFils > 0 ? `, ${formatFils(f.balanceFils)} due by ${formatISODate(invoice.dueDate, true)}` : ", paid in full"}. Thank you.`,
      });
  const creditSends = await Promise.all(
    credits.map((c) =>
      sendDocProps("credit", c.id, { phone: customer?.phone, email: customer?.email, name: customer?.name, title: `Credit Note ${c.number}`, filename: `${c.number} ${customer?.name ?? ""}`, message: `${s.tradeName}: Credit Note ${c.number} for ${formatFils(c.totalFils)} against ${invoice.number}.` }),
    ),
  );

  return (
    <>
      <Celebrate />
      <BackLink href="/money/invoices" label="Invoices" />
      <header className="mb-5">
        <p className="tabular flex flex-wrap items-center gap-x-2 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          <span>{isOpening ? "Opening balance" : `Tax Invoice ${invoice.number}`}</span>
          <span>· {formatISODate(invoice.invoiceDate, true)}</span>
          {invoice.customerPoNumber ? <span>· Customer PO {invoice.customerPoNumber}</span> : null}
          {order ? (
            <span>
              · for{" "}
              <Link href={`/orders/${order.id}`} className="underline underline-offset-2">
                {order.number}
              </Link>
            </span>
          ) : null}
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          <Link href={`/customers/${invoice.customerId}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {customer?.name}
          </Link>
          {customer?.tier === "vip" ? <TierTag tier="vip" /> : null}
        </h1>
        {branch ? (
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-muted">
            <MapPinIcon className="size-4" />
            {branch.name}
          </p>
        ) : null}
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <InvoiceStatusTag status={status} />
          {f.balanceFils > 0 ? <DueChip date={invoice.dueDate} /> : null}
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-semibold text-ink-muted">{f.balanceFils > 0 ? "Still to pay" : f.balanceFils < 0 ? "Paid over" : "Paid in full"}</p>
          <p className="mt-1 font-display text-[2.5rem] leading-none font-medium sm:text-[3rem]">
            <CountUp fils={f.balanceFils > 0 ? f.balanceFils : f.balanceFils < 0 ? -f.balanceFils : f.totalFils} />
          </p>
          <p className="mt-2 text-[14px] text-ink-muted">
            {f.balanceFils > 0 ? `Due ${formatISODate(invoice.dueDate, true)}. Total ${formatFils(f.totalFils)}.` : `Total ${formatFils(f.totalFils)}.`}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {f.balanceFils > 0 ? (
            <LinkButton href={`/money/payments/new?customer=${invoice.customerId}&invoice=${id}`} size="lg">
              Record payment
            </LinkButton>
          ) : null}
          {send ? <SendDoc {...send} /> : null}
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          {lines.length ? (
            <Panel title="Lines">
              <ul className="flex flex-col divide-y divide-line">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{l.description}</p>
                      <p className="tabular text-[13px] text-ink-muted">
                        {l.qty} × {formatFils(l.unitPriceFils, { currency: false })} + VAT {formatFils(l.vatFils, { currency: false })}
                      </p>
                    </div>
                    <p className="tabular text-[15px] font-semibold">{formatFils(l.netFils + l.vatFils)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel title="Opening balance">
              <p className="text-[15px] text-ink-muted">What {customer?.name} owed on {formatISODate(invoice.invoiceDate, true)}, before you started using the app. It is not a tax invoice.</p>
            </Panel>
          )}

          {paid.length || credits.length ? (
            <Panel title="Payments and credit notes">
              <ul className="flex flex-col divide-y divide-line">
                {paid.map(({ a, p }) => (
                  <li key={a.id}>
                    <Link href={`/money/payments/${p.id}`} className="group flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="tabular text-[14px] font-semibold">
                          {p.number}
                          {p.isDeposit ? <span className="ml-2 text-[12px] font-semibold text-[#4d7a12]">Paid in advance</span> : null}
                        </p>
                        <p className="text-[13px] text-ink-muted">
                          {formatISODate(p.paymentDate, true)} · {METHOD_LABEL[p.method]}
                        </p>
                      </div>
                      <p className="tabular text-[15px] font-semibold text-[#4d7a12]">{formatFils(a.amountFils)}</p>
                      <ChevronRightIcon className="size-4 text-ink-muted/60" />
                    </Link>
                  </li>
                ))}
                {credits.map((c, i) => (
                  <li key={c.id} className="flex flex-col gap-2 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="tabular text-[14px] font-semibold">Credit Note {c.number}</p>
                        <p className="text-[13px] text-ink-muted">
                          {formatISODate(c.creditDate, true)} · {c.reason}
                        </p>
                      </div>
                      <p className="tabular text-[15px] font-semibold">{formatFils(c.totalFils)}</p>
                    </div>
                    <SendDoc {...creditSends[i]} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-5 text-[15px]">
            {!isOpening ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd>{formatFils(invoice.subtotalFils)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">VAT</dt>
                  <dd>{formatFils(invoice.vatFils)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Total</dt>
              <dd>{formatFils(f.totalFils)}</dd>
            </div>
            {f.advanceFils ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Paid in advance</dt>
                <dd className="text-[#4d7a12]">{formatFils(-f.advanceFils)}</dd>
              </div>
            ) : null}
            {f.paidFils - f.advanceFils ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Amount paid</dt>
                <dd className="text-[#4d7a12]">{formatFils(-(f.paidFils - f.advanceFils))}</dd>
              </div>
            ) : null}
            {f.creditedFils ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Credit notes</dt>
                <dd>{formatFils(-f.creditedFils)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Balance due</dt>
              <dd className="font-display text-2xl font-medium">{formatFils(Math.max(0, f.balanceFils))}</dd>
            </div>
          </dl>
          {!isOpening && f.creditedFils < f.totalFils ? (
            <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-5">
              <p className="text-[15px] font-semibold">Something wrong on this invoice?</p>
              <p className="text-[13px] text-ink-muted">An issued Tax Invoice is never edited. Pieces returned or a price mistake are corrected with a credit note.</p>
              <LinkButton href={`/money/invoices/${id}/credit`} variant="outline" className="mt-2 self-start">
                Make credit note
              </LinkButton>
            </div>
          ) : null}
          {invoice.notes && !isOpening ? (
            <Panel title="Note">
              <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
            </Panel>
          ) : null}
          <RecentActivity entityId={id} />
        </div>
      </div>
    </>
  );
}
