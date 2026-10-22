import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { purchaseOrders, suppliers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { ReceiveForm } from "@/components/purchases/receive-form";
import { todayISO } from "@/lib/dates";
import { poLineProgress } from "@/lib/payables";
import { centiInput, formatQty } from "@/lib/qty";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Receive goods" };

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const po = /^[0-9a-f-]{36}$/.test(id) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }) : undefined;
  if (!po) notFound();
  if (po.status !== "sent") redirect(`/purchases/orders/${id}`);
  const [supplier, progress] = await Promise.all([db.query.suppliers.findFirst({ where: eq(suppliers.id, po.supplierId) }), poLineProgress(id)]);
  const lines = progress.map((l) => {
    const left = Math.max(0, l.qtyCenti - l.receivedCenti);
    return {
      id: l.id,
      description: l.description,
      unit: l.unit,
      left: left ? (l.unit === "pcs" ? String(left / 100) : centiInput(left)) : "",
      leftLabel: formatQty(left, l.unit),
      stock: Boolean(l.fabricId && l.unit === "m"),
    };
  });
  const outsourcing = po.kind === "outsourcing";
  return (
    <>
      <BackLink href={`/purchases/orders/${id}`} label={po.number ?? "Purchase order"} />
      <PageHeader
        eyebrow={po.number}
        title={outsourcing ? `Pieces back from ${supplier?.name ?? "the unit"}` : `Goods from ${supplier?.name ?? "the supplier"}`}
        description="Each line starts at what is still to come. Change it to what actually arrived. Measured roll lengths are fine."
      />
      <ReceiveForm poId={id} lines={lines} today={todayISO()} outsourcing={outsourcing} />
    </>
  );
}
