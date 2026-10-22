import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/data/detail";
import { DocumentEditor } from "@/components/orders/document-editor";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { salesOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorLookups } from "@/lib/editor-data";
import { initialForOrderEdit } from "@/lib/editor-initial";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id), columns: { stage: true } });
  if (!order) notFound();
  if (!["confirmed", "stitching", "ready"].includes(order.stage)) redirect(`/orders/${id}`);
  const [initial, lookups] = await Promise.all([initialForOrderEdit(id), editorLookups()]);
  if (!initial) notFound();
  return (
    <>
      <BackLink href={`/orders/${id}`} label={initial.number ?? "Order"} />
      <PageHeader title={`Edit ${initial.number}`} description="Tasks that have started are locked. Everything else can change." />
      <DocumentEditor mode="order" initial={initial} cancelHref={`/orders/${id}`} {...lookups} />
    </>
  );
}
