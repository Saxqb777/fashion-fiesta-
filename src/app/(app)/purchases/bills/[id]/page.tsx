import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { purchaseOrders, supplierBillLines, supplierBills, supplierPaymentAllocations, supplierPayments, suppliers } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Facts, Panel } from "@/components/data/detail";
import { RecentActivity } from "@/components/data/recent-activity";
import { LinkButton } from "@/components/link-button";
import { CountUp } from "@/components/money/count-up";
import { DueChip } from "@/components/orders/bits";
import { BillStatusTag } from "@/components/purchases/bits";
import { formatISODate } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { billFigures, billLabel, billStatus } from "@/lib/payables";
import { formatQty } from "@/lib/qty";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Supplier bill" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const bill = /^[0-9a-f-]{36}$/.test(id) ? await db.query.supplierBills.findFirst({ where: eq(supplierBills.id, id) }) : undefined;
  if (!bill) notFound();
  const [supplier, po, lines, paid, figures] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, bill.supplierId) }),
    bill.poId ? db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, bill.poId), columns: { id: true, number: true } }) : undefined,
    db.select().from(supplierBillLines).where(eq(supplierBillLines.billId, id)).orderBy(asc(supplierBillLines.sort)),
    db
      .select({ a: supplierPaymentAllocations, p: supplierPayments })
      .from(supplierPaymentAllocations)
      .innerJoin(supplierPayments, eq(supplierPayments.id, supplierPaymentAllocations.paymentId))
      .where(eq(supplierPaymentAllocations.billId, id))
      .orderBy(asc(supplierPayments.paymentDate)),
    billFigures([id]),
  ]);
  const f = figures.get(id)!;
  return (
    <>
      <BackLink href="/purchases/owe" label="Who you owe" />
      <header className="mb-5">
        <p className="tabular flex flex-wrap items-center gap-x-2 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          <span>{billLabel(bill)}</span>
          <span>· {formatISODate(bill.billDate, true)}</span>
          {po ? (
            <span>
              · for{" "}
              <Link href={`/purchases/orders/${po.id}`} className="underline underline-offset-2">
                {po.number}
              </Link>
            </span>
          ) : null}
        </p>
        <h1 className="mt-2 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          <Link href={`/purchases/suppliers/${bill.supplierId}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {supplier?.name}
          </Link>
        </h1>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BillStatusTag status={billStatus(f, bill.dueDate)} />
          {f.balanceFils > 0 ? <DueChip date={bill.dueDate} /> : null}
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-semibold text-ink-muted">{f.balanceFils > 0 ? "Still to pay" : "Paid in full"}</p>
          <p className="mt-1 font-display text-[2.5rem] leading-none font-medium sm:text-[3rem]">
            <CountUp fils={f.balanceFils > 0 ? f.balanceFils : f.totalFils} />
          </p>
          <p className="mt-2 text-[14px] text-ink-muted">{f.balanceFils > 0 ? `Pay by ${formatISODate(bill.dueDate, true)}. Total ${formatFils(f.totalFils)}.` : `Total ${formatFils(f.totalFils)}.`}</p>
        </div>
        {f.balanceFils > 0 ? (
          <LinkButton href={`/purchases/payments/new?supplier=${bill.supplierId}&bill=${id}`} size="lg">
            Pay {supplier?.name}
          </LinkButton>
        ) : null}
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
                        {formatQty(l.qtyCenti, l.unit)} × {formatFils(l.unitPriceFils, { currency: false })}
                        {l.vatFils ? ` + VAT ${formatFils(l.vatFils, { currency: false })}` : ""}
                      </p>
                    </div>
                    <p className="tabular text-[15px] font-semibold">{formatFils(l.netFils + l.vatFils)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel title="Opening balance">
              <p className="text-[15px] text-ink-muted">What you owed {supplier?.name} on {formatISODate(bill.billDate, true)}, before you started using the app.</p>
            </Panel>
          )}
          {paid.length ? (
            <Panel title="Payments">
              <ul className="flex flex-col divide-y divide-line">
                {paid.map(({ a, p }) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-[14px] font-semibold">{formatISODate(p.paymentDate, true)}</p>
                      <p className="text-[13px] text-ink-muted">
                        {METHOD_LABEL[p.method]}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <p className="tabular text-[15px] font-semibold text-[#4d7a12]">{formatFils(a.amountFils)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatFils(bill.subtotalFils)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">VAT, you claim back</dt>
              <dd>{formatFils(bill.vatFils)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Total</dt>
              <dd>{formatFils(f.totalFils)}</dd>
            </div>
            {f.paidFils ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Paid</dt>
                <dd className="text-[#4d7a12]">{formatFils(-f.paidFils)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Still to pay</dt>
              <dd className="font-display text-2xl font-medium">{formatFils(Math.max(0, f.balanceFils))}</dd>
            </div>
          </dl>
          <Panel>
            <Facts
              items={[
                { label: "Their invoice number", value: bill.billNumber },
                { label: "Their TRN", value: bill.supplierTrn ? <span className="tabular">{bill.supplierTrn}</span> : null },
                { label: "Note", value: bill.kind === "opening_balance" ? null : bill.notes },
              ]}
            />
          </Panel>
          <RecentActivity entityId={id} />
        </div>
      </div>
    </>
  );
}
