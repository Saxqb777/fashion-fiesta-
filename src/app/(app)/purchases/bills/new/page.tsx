import type { Metadata } from "next";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { purchaseOrders, suppliers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { BillForm, type BillLineInput } from "@/components/purchases/bill-form";
import { todayISO } from "@/lib/dates";
import { poLineProgress } from "@/lib/payables";
import { centiInput, formatQty } from "@/lib/qty";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Enter a bill" };

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ po?: string; supplier?: string }> }) {
  await requireOwner();
  const q = await searchParams;
  const po = q.po && /^[0-9a-f-]{36}$/.test(q.po) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, q.po) }) : undefined;
  const [list, s, progress] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name, trn: suppliers.trn, paymentDays: suppliers.paymentDays }).from(suppliers).where(isNull(suppliers.deletedAt)).orderBy(asc(suppliers.name)),
    getSettings(),
    po ? poLineProgress(po.id) : Promise.resolve([]),
  ]);
  const supplierId = po?.supplierId ?? (q.supplier && list.some((x) => x.id === q.supplier) ? q.supplier : null);
  const supplier = list.find((x) => x.id === supplierId);
  // Bill what came in and is not billed yet; before anything arrives, what was ordered.
  const lines: BillLineInput[] = progress
    .map((l) => {
      const base = l.receivedCenti > 0 ? l.receivedCenti : l.qtyCenti;
      const left = Math.max(0, base - l.billedCenti);
      return {
        key: l.id,
        poLineId: l.id,
        description: l.description,
        unit: l.unit,
        qty: left ? (l.unit === "pcs" ? String(left / 100) : centiInput(left)) : "",
        unitPrice: l.unitPriceFils ? (l.unitPriceFils / 100).toFixed(2) : "",
        hint: `Ordered ${formatQty(l.qtyCenti, l.unit)}${l.receivedCenti ? `, received ${formatQty(l.receivedCenti, l.unit)}` : ""}${l.billedCenti ? `, billed ${formatQty(l.billedCenti, l.unit)}` : ""}`,
      };
    })
    .filter((l) => l.qty);
  return (
    <>
      <BackLink href={po ? `/purchases/orders/${po.id}` : "/purchases/owe"} label={po?.number ?? "Who you owe"} />
      <PageHeader
        eyebrow={po?.number ? `Against ${po.number}` : undefined}
        title={supplier ? `Bill from ${supplier.name}` : "Enter a supplier bill"}
        description="Type it from their invoice. The VAT on it is what you claim back, so keep their TRN."
      />
      <BillForm
        suppliers={list}
        supplierId={supplierId}
        po={po ? { id: po.id, number: po.number } : null}
        lines={lines}
        vatRateBp={s.vatRateBp}
        today={todayISO()}
        cancelHref={po ? `/purchases/orders/${po.id}` : "/purchases/owe"}
      />
    </>
  );
}
