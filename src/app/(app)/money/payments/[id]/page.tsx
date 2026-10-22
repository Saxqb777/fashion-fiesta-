import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { db } from "@/db";
import { customers, invoices, paymentAllocations, payments, salesOrders } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Facts, Panel } from "@/components/data/detail";
import { LinkButton } from "@/components/link-button";
import { Celebrate } from "@/components/money/celebrate";
import { CountUp } from "@/components/money/count-up";
import { InvoiceStatusTag } from "@/components/money/bits";
import { SendDoc } from "@/components/money/send-doc";
import { formatISODate } from "@/lib/dates";
import { sendDocProps } from "@/lib/doc-links";
import { METHOD_LABEL, invoiceFigures, invoiceStatus } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const payment = /^[0-9a-f-]{36}$/.test(id) ? await db.query.payments.findFirst({ where: eq(payments.id, id) }) : undefined;
  if (!payment) notFound();
  const [customer, order, allocs, s] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, payment.customerId) }),
    payment.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, payment.orderId), columns: { id: true, number: true } }) : undefined,
    db
      .select({ a: paymentAllocations, i: invoices })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, id))
      .orderBy(invoices.dueDate),
    getSettings(),
  ]);
  const figures = await invoiceFigures(allocs.map((r) => r.i.id));
  const used = allocs.reduce((sum, r) => sum + r.a.amountFils, 0);
  const left = payment.amountFils - used;
  const send = await sendDocProps("receipt", id, {
    phone: customer?.phone,
    filename: `${payment.number} ${customer?.name ?? ""}`,
    message: `${s.tradeName}: receipt ${payment.number}. We received ${formatFils(payment.amountFils)} on ${formatISODate(payment.paymentDate, true)}. Thank you.`,
  });

  return (
    <>
      <Celebrate />
      <BackLink href="/money/payments" label="Payments" />
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <p className="tabular text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          Receipt {payment.number} · {formatISODate(payment.paymentDate, true)}
        </p>
        <p className="mt-3 font-display text-[2.75rem] leading-none font-medium sm:text-[3.5rem]">
          <CountUp fils={payment.amountFils} />
        </p>
        <p className="mt-2 text-[16px]">
          from{" "}
          <Link href={`/customers/${payment.customerId}`} className="font-semibold hover:underline">
            {customer?.name}
          </Link>{" "}
          by {METHOD_LABEL[payment.method].toLowerCase()}
          {payment.isDeposit && order ? (
            <>
              , deposit on{" "}
              <Link href={`/orders/${order.id}`} className="font-semibold underline underline-offset-2">
                {order.number}
              </Link>
            </>
          ) : null}
          .
        </p>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-5">
          <SendDoc {...send} />
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="What it paid">
          {allocs.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {allocs.map(({ a, i }) => {
                const f = figures.get(i.id)!;
                return (
                  <li key={a.id}>
                    <Link href={`/money/invoices/${i.id}`} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                          <span className="tabular">{i.kind === "opening_balance" ? "Opening balance" : i.number}</span>
                          <InvoiceStatusTag status={invoiceStatus(f, i.dueDate)} />
                        </p>
                        <p className="tabular text-[13px] text-ink-muted">{f.balanceFils > 0 ? `${formatFils(f.balanceFils)} still due` : "Nothing left to pay"}</p>
                      </div>
                      <p className="tabular text-[15px] font-semibold">{formatFils(a.amountFils)}</p>
                      <ChevronRightIcon className="size-4 text-ink-muted/60" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {left > 0 ? (
            <p className={allocs.length ? "mt-3 border-t border-line pt-3 text-[15px]" : "text-[15px]"}>
              <span className="tabular font-semibold">{formatFils(left)}</span>{" "}
              <span className="text-ink-muted">
                {payment.isDeposit ? "is held as a deposit. It is applied when you invoice the order." : "is kept as credit on account. It is used on their next invoice."}
              </span>
            </p>
          ) : null}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel>
            <Facts
              items={[
                { label: "Method", value: METHOD_LABEL[payment.method] },
                { label: "Reference", value: payment.reference },
                { label: "Note", value: payment.notes },
              ]}
            />
          </Panel>
          <LinkButton href={`/money/statement/${payment.customerId}`} variant="outline" className="self-start">
            {customer?.name} statement
          </LinkButton>
        </div>
      </div>
    </>
  );
}
