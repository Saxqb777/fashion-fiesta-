import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { customers, salesOrders } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { DeliveryForm } from "@/components/money/delivery-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { orderLineProgress } from "@/lib/order-progress";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Delivery note" };

export default async function DeliverPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const order = /^[0-9a-f-]{36}$/.test(id) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) }) : undefined;
  if (!order) notFound();
  if (order.stage === "draft" || order.stage === "cancelled") redirect(`/orders/${id}`);
  const [customer, progress] = await Promise.all([db.query.customers.findFirst({ where: eq(customers.id, order.customerId) }), orderLineProgress(id)]);
  const lines = progress.filter((l) => l.qty - l.delivered > 0).map((l) => ({ id: l.id, description: l.description, left: l.qty - l.delivered }));
  if (!lines.length) redirect(`/orders/${id}`);
  return (
    <>
      <BackLink href={`/orders/${id}`} label={order.number ?? "Order"} />
      <PageHeader
        eyebrow={order.customerPoNumber ? `${order.number} · Customer PO ${order.customerPoNumber}` : order.number}
        title={`Delivery note for ${customer?.name ?? "customer"}`}
        description="Each line starts at what is left to deliver. Lower it if only part is going out today."
      />
      <DeliveryForm orderId={id} lines={lines} today={todayISO()} />
    </>
  );
}
