import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { setFabricArchived } from "@/actions/catalog";
import { db } from "@/db";
import { fabrics, purchaseOrders, stockMovements, tasks, users } from "@/db/schema";
import { Panel } from "@/components/data/detail";
import { AdjustStockButton } from "@/components/purchases/adjust-stock";
import { formatISODate } from "@/lib/dates";
import { stockFor } from "@/lib/payables";
import { formatQty } from "@/lib/qty";
import { ArchiveButton } from "@/components/data/archive-button";
import { BackLink } from "@/components/data/detail";
import { RecentActivity } from "@/components/data/recent-activity";
import { ArchivedTag } from "@/components/data/tags";
import { FabricForm } from "@/components/forms/fabric-form";
import { PageHeader } from "@/components/page-header";
import { fabricSuppliers } from "@/lib/lookups";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Fabric" };

export default async function FabricPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const fabric = /^[0-9a-f-]{36}$/.test(id) ? await db.query.fabrics.findFirst({ where: eq(fabrics.id, id) }) : undefined;
  if (!fabric) notFound();
  const [suppliers, stock, moves] = await Promise.all([
    fabricSuppliers(),
    stockFor([fabric.id]),
    db
      .select({ m: stockMovements, poNumber: purchaseOrders.number, tailor: users.name })
      .from(stockMovements)
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, stockMovements.poId))
      .leftJoin(tasks, eq(tasks.id, stockMovements.taskId))
      .leftJoin(users, eq(users.id, tasks.tailorId))
      .where(eq(stockMovements.fabricId, fabric.id))
      .orderBy(desc(stockMovements.movedOn), desc(stockMovements.createdAt))
      .limit(30),
  ]);
  const onHand = stock.get(fabric.id) ?? 0;
  const low = fabric.lowStockCenti !== null && onHand <= fabric.lowStockCenti;
  const KIND = { opening: "Stock at the start", received: "Received", taken: "Taken for a task", sent: "Sent to a unit", adjusted: "Counted" } as const;
  const current = fabric.supplierId && !suppliers.some((s) => s.id === fabric.supplierId);
  const options = current ? [...suppliers, { id: fabric.supplierId!, name: "Archived supplier" }] : suppliers;
  return (
    <>
      <BackLink href="/purchases/fabrics" label="Fabrics" />
      <PageHeader title={fabric.name} eyebrow={fabric.deletedAt ? <ArchivedTag /> : fabric.colour ?? undefined} />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
          <FabricForm fabric={fabric} suppliers={options} />
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Stock">
            <p className={low ? "font-display text-[2.25rem] leading-none font-medium text-brand" : "font-display text-[2.25rem] leading-none font-medium"}>
              <span className="tabular">{formatQty(onHand)}</span>
            </p>
            <p className="mt-1 text-[14px] text-ink-muted">
              {low ? <span className="font-semibold text-brand">Running low. </span> : null}
              {fabric.lowStockCenti ? `Warns at ${formatQty(fabric.lowStockCenti)}.` : "Set a low stock level below to get a warning on Today."}
            </p>
            <div className="mt-4">
              <AdjustStockButton fabricId={fabric.id} stockCenti={onHand} first={moves.length === 0} />
            </div>
            {moves.length ? (
              <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
                {moves.map(({ m, poNumber, tailor }) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {KIND[m.kind]}
                        {m.kind === "taken" && tailor ? ` by ${tailor}` : ""}
                        {poNumber && m.poId ? (
                          <>
                            {" · "}
                            <Link href={`/purchases/orders/${m.poId}`} className="underline underline-offset-2">
                              {poNumber}
                            </Link>
                          </>
                        ) : null}
                        {m.taskId ? (
                          <>
                            {" · "}
                            <Link href={`/workshop/tasks/${m.taskId}`} className="underline underline-offset-2">
                              task
                            </Link>
                          </>
                        ) : null}
                      </p>
                      <p className="text-ink-muted">
                        {formatISODate(m.movedOn, true)}
                        {m.note && m.kind !== "received" ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                    <span className={m.qtyCenti > 0 ? "tabular font-semibold text-[#4d7a12]" : "tabular font-semibold"}>
                      {m.qtyCenti > 0 ? "+" : ""}
                      {formatQty(m.qtyCenti)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <RecentActivity entityId={fabric.id} />
          <div className="flex justify-end">
            <ArchiveButton action={setFabricArchived} id={fabric.id} archived={Boolean(fabric.deletedAt)} noun="fabric" />
          </div>
        </div>
      </div>
    </>
  );
}
