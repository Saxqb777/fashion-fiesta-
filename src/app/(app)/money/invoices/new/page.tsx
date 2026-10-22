import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { customers, payments, salesOrders, soLineAllocations, soLines } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { InvoiceForm } from "@/components/money/invoice-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { unallocatedByPayment } from "@/lib/ledger";
import { orderLineProgress } from "@/lib/order-progress";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireOwner();
  const { order: orderId = "" } = await searchParams;
  const order = /^[0-9a-f-]{36}$/.test(orderId) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) }) : undefined;
  if (!order) notFound();
  if (order.stage === "draft" || order.stage === "cancelled") redirect(`/orders/${order.id}`);
  const [customer, progress, s, deposits, credit] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, order.customerId) }),
    orderLineProgress(order.id),
    getSettings(),
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.isDeposit, true))),
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.customerId, order.customerId), eq(payments.isDeposit, false))),
  ]);
  const lines = progress
    .filter((l) => l.qty - l.invoiced > 0)
    .map((l) => ({ soLineId: l.id, productId: l.productId, description: l.description, left: l.qty - l.invoiced, unitPriceFils: l.unitPriceFils }));
  if (!lines.length) redirect(`/orders/${order.id}`);
  const left = await unallocatedByPayment([...deposits, ...credit].map((p) => p.id));
  const depositFils = deposits.reduce((sum, p) => sum + Math.max(0, left.get(p.id) ?? 0), 0);
  const creditFils = credit.reduce((sum, p) => sum + Math.max(0, left.get(p.id) ?? 0), 0);
  const [split] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(soLineAllocations)
    .innerJoin(soLines, eq(soLines.id, soLineAllocations.soLineId))
    .where(eq(soLines.orderId, order.id));
  const dueDays = customer?.creditDays ?? (customer?.type === "wholesale" ? s.defaultCreditDays : 0);
  const undelivered = progress.some((l) => l.delivered < l.qty) && !order.deliveredAt;

  return (
    <>
      <BackLink href={`/orders/${order.id}`} label={order.number ?? "Order"} />
      <PageHeader
        eyebrow={order.customerPoNumber ? `${order.number} · Customer PO ${order.customerPoNumber}` : order.number}
        title={`Tax Invoice for ${customer?.name ?? "customer"}`}
        description={
          undelivered
            ? "Not everything is delivered yet. You can still invoice now, or lower the quantities to invoice only what went out."
            : "Each line starts at what is left to invoice. Prices can be changed, and you can add a line."
        }
      />
      <InvoiceForm orderId={order.id} lines={lines} depositFils={depositFils} creditFils={creditFils} vatRateBp={s.vatRateBp} today={todayISO()} dueDays={dueDays} hasSplits={split.n > 0} />
    </>
  );
}
