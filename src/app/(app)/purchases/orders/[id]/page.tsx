import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRightIcon, PencilIcon } from "lucide-react";
import { db } from "@/db";
import { fabrics, goodsReceiptLines, goodsReceipts, purchaseOrders, salesOrders, soLines, stockMovements, supplierBills, suppliers } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Panel } from "@/components/data/detail";
import { RecentActivity } from "@/components/data/recent-activity";
import { LinkButton } from "@/components/link-button";
import { SendDoc } from "@/components/money/send-doc";
import { StageTracker } from "@/components/orders/stage-tracker";
import { BillStatusTag, PoStageTag } from "@/components/purchases/bits";
import { FabricOutButton } from "@/components/purchases/fabric-out";
import { CancelPoButton } from "@/components/purchases/po-actions";
import { formatISODate, todayISO } from "@/lib/dates";
import { sendDocProps } from "@/lib/doc-links";
import { formatFils } from "@/lib/money";
import { PO_STEPS, billFigures, billLabel, billStatus, poLineProgress, poSummaries, stockFor } from "@/lib/payables";
import { centiInput, formatQty } from "@/lib/qty";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const po = /^[0-9a-f-]{36}$/.test(id) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }) : undefined;
  if (!po) notFound();
  const [supplier, order, lines, receipts, sent, bills, summary, st] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, po.supplierId) }),
    po.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, po.orderId), columns: { id: true, number: true } }) : undefined,
    poLineProgress(id),
    db.select().from(goodsReceipts).where(eq(goodsReceipts.poId, id)).orderBy(desc(goodsReceipts.receivedDate)),
    db
      .select({ m: stockMovements, fabricName: fabrics.name, colour: fabrics.colour })
      .from(stockMovements)
      .innerJoin(fabrics, eq(fabrics.id, stockMovements.fabricId))
      .where(and(eq(stockMovements.poId, id), eq(stockMovements.kind, "sent")))
      .orderBy(desc(stockMovements.createdAt)),
    db.select().from(supplierBills).where(eq(supplierBills.poId, id)).orderBy(asc(supplierBills.billDate)),
    poSummaries([id]),
    getSettings(),
  ]);
  const stage = summary.get(id)?.stage ?? "draft";
  const receiptLines = receipts.length ? await db.select().from(goodsReceiptLines).where(inArray(goodsReceiptLines.receiptId, receipts.map((r) => r.id))) : [];
  const figures = await billFigures(bills.map((b) => b.id));
  const editable = po.status !== "cancelled" && (po.status === "draft" || (!receipts.length && !bills.length));
  const outsourcing = po.kind === "outsourcing";
  const openBill = bills.find((b) => (figures.get(b.id)?.balanceFils ?? 0) > 0);
  const send = po.number
    ? await sendDocProps("po", id, {
        phone: supplier?.phone,
        email: supplier?.email,
        name: supplier?.name,
        title: `Purchase Order ${po.number}`,
        filename: `${po.number} ${supplier?.name ?? ""}`,
        message: `${st.tradeName}: purchase order ${po.number} for ${formatFils(po.totalFils)}${po.expectedDate ? `, needed by ${formatISODate(po.expectedDate, true)}` : ""}. Please quote this number on your delivery note and invoice. Thank you.`,
      })
    : null;

  // Fabric for "Fabric sent": the fabrics on the order's lines first, with what each piece needs.
  let fabricChoices: { id: string; label: string; stockCenti?: number }[] = [];
  let defaultFabric: string | null = null;
  let defaultMetres = "";
  if (outsourcing && po.status !== "cancelled") {
    const allFabrics = await db.select({ id: fabrics.id, name: fabrics.name, colour: fabrics.colour }).from(fabrics).where(isNull(fabrics.deletedAt)).orderBy(asc(fabrics.name));
    const stock = await stockFor(allFabrics.map((f) => f.id));
    fabricChoices = allFabrics.map((f) => ({ id: f.id, label: [f.name, f.colour].filter(Boolean).join(", "), stockCenti: stock.get(f.id) ?? 0 }));
    const lineIds = lines.map((l) => l.soLineId).filter(Boolean) as string[];
    const orderLines = lineIds.length ? await db.select().from(soLines).where(inArray(soLines.id, lineIds)) : [];
    const withFabric = orderLines.find((l) => l.fabricId);
    if (withFabric) {
      defaultFabric = withFabric.fabricId;
      const need = lines.reduce((sum, l) => {
        const ol = orderLines.find((o) => o.id === l.soLineId && o.fabricId === withFabric.fabricId);
        return sum + (ol?.metresPerPieceCenti ? (ol.metresPerPieceCenti * l.qtyCenti) / 100 : 0);
      }, 0);
      const already = sent.filter((s) => s.m.fabricId === withFabric.fabricId).reduce((sum, s) => sum - s.m.qtyCenti, 0);
      defaultMetres = need > already ? centiInput(Math.round(need - already)) : "";
    }
  }

  const nextAction =
    stage === "draft" ? (
      <LinkButton href={`/purchases/orders/${id}/edit`} size="lg">
        Review and confirm
      </LinkButton>
    ) : stage === "sent" ? (
      <LinkButton href={`/purchases/orders/${id}/receive`} size="lg">
        {outsourcing ? "Pieces came back" : "Receive goods"}
      </LinkButton>
    ) : stage === "received" ? (
      <LinkButton href={`/purchases/bills/new?po=${id}`} size="lg">
        Enter their bill
      </LinkButton>
    ) : stage === "billed" && openBill ? (
      <LinkButton href={`/purchases/payments/new?supplier=${po.supplierId}&bill=${openBill.id}`} size="lg">
        Pay {supplier?.name}
      </LinkButton>
    ) : stage === "paid" ? (
      <span className="inline-flex h-11 items-center rounded-full bg-leaf/15 px-5 text-[15px] font-semibold text-[#4d7a12]">Paid in full</span>
    ) : null;

  return (
    <>
      <BackLink href="/purchases/orders" label="Purchase orders" />
      <header className="mb-5">
        <p className="tabular flex flex-wrap items-center gap-x-2 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          <span>{po.number ? `Purchase order ${po.number}` : "Draft purchase order"}</span>
          <span>· {formatISODate(po.poDate, true)}</span>
          {po.expectedDate ? <span>· expected {formatISODate(po.expectedDate, true)}</span> : null}
          {order ? (
            <span>
              · stitching for{" "}
              <Link href={`/orders/${order.id}`} className="underline underline-offset-2">
                {order.number}
              </Link>
            </span>
          ) : null}
        </p>
        <h1 className="mt-2 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          <Link href={`/purchases/suppliers/${po.supplierId}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {supplier?.name}
          </Link>
        </h1>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PoStageTag stage={stage} />
          {editable ? (
            <LinkButton href={`/purchases/orders/${id}/edit`} variant="outline" size="sm">
              <PencilIcon />
              Edit
            </LinkButton>
          ) : null}
          {outsourcing && po.status !== "cancelled" ? <FabricOutButton mode="sent" refId={id} fabrics={fabricChoices} defaultFabricId={defaultFabric} defaultMetres={defaultMetres} today={todayISO()} size="sm" /> : null}
          {editable || po.status === "draft" ? <CancelPoButton id={id} draft={po.status === "draft"} /> : null}
        </div>
        {send ? (
          <div className="mt-3">
            <SendDoc {...send} />
          </div>
        ) : null}
      </header>

      {po.status === "cancelled" ? (
        <section className="rounded-[14px] border border-dashed border-ink/20 bg-surface p-5">
          <h2 className="text-xl font-medium">Cancelled</h2>
          <p className="mt-1 text-[15px] text-ink-muted">This purchase order is kept on record. Nothing more can be received or billed against it.</p>
        </section>
      ) : (
        <StageTracker current={stage} steps={PO_STEPS} action={nextAction} />
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Lines">
            <ul className="flex flex-col divide-y divide-line">
              {lines.map((l) => (
                <li key={l.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                      {l.fabricId ? (
                        <Link href={`/purchases/fabrics/${l.fabricId}`} className="hover:underline">
                          {l.description}
                        </Link>
                      ) : (
                        l.description
                      )}
                    </p>
                    <p className="tabular text-[13px] text-ink-muted">
                      {formatQty(l.qtyCenti, l.unit)} × {formatFils(l.unitPriceFils, { currency: false })}
                      {po.status !== "draft" ? (
                        <>
                          {" · "}
                          <span className={l.receivedCenti >= l.qtyCenti ? "font-semibold text-[#4d7a12]" : ""}>
                            {l.receivedCenti ? `${formatQty(l.receivedCenti, l.unit)} ${outsourcing ? "back" : "received"}` : outsourcing ? "none back yet" : "nothing received yet"}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <p className="tabular text-[15px] font-semibold">{formatFils(l.netFils + l.vatFils)}</p>
                </li>
              ))}
            </ul>
          </Panel>

          {receipts.length ? (
            <Panel title={outsourcing ? "Pieces back" : "Goods received"}>
              <ul className="flex flex-col divide-y divide-line">
                {receipts.map((r) => (
                  <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-[14px] font-semibold">{formatISODate(r.receivedDate, true)}</p>
                    <p className="tabular text-[13px] text-ink-muted">
                      {receiptLines
                        .filter((x) => x.receiptId === r.id)
                        .map((x) => {
                          const l = lines.find((y) => y.id === x.poLineId);
                          return `${formatQty(x.qtyCenti, l?.unit ?? "m")} ${l?.description ?? ""}`;
                        })
                        .join(", ")}
                      {r.notes ? `. ${r.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {sent.length ? (
            <Panel title="Fabric sent">
              <ul className="flex flex-col divide-y divide-line">
                {sent.map(({ m, fabricName, colour }) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/purchases/fabrics/${m.fabricId}`} className="text-[14px] font-semibold hover:underline">
                      {[fabricName, colour].filter(Boolean).join(", ")}
                    </Link>
                    <span className="tabular text-[14px]">
                      {formatQty(-m.qtyCenti)} <span className="text-ink-muted">· {formatISODate(m.movedOn, true)}</span>
                    </span>
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
              <dd>{formatFils(po.subtotalFils)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">VAT</dt>
              <dd>{formatFils(po.vatFils)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-display text-2xl font-medium">{formatFils(po.totalFils)}</dd>
            </div>
          </dl>
          {po.status !== "draft" && po.status !== "cancelled" ? (
            <Panel
              title="Their bills"
              action={
                stage !== "paid" ? (
                  <LinkButton href={`/purchases/bills/new?po=${id}`} variant="outline" size="sm">
                    Enter a bill
                  </LinkButton>
                ) : null
              }
            >
              {bills.length ? (
                <ul className="flex flex-col divide-y divide-line">
                  {bills.map((b) => {
                    const f = figures.get(b.id)!;
                    return (
                      <li key={b.id}>
                        <Link href={`/purchases/bills/${b.id}`} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                              {billLabel(b)}
                              <BillStatusTag status={billStatus(f, b.dueDate)} />
                            </p>
                            <p className="tabular text-[13px] text-ink-muted">{f.balanceFils > 0 ? `${formatFils(f.balanceFils)} to pay by ${formatISODate(b.dueDate, true)}` : "Paid"}</p>
                          </div>
                          <p className="tabular text-[15px] font-semibold">{formatFils(b.totalFils)}</p>
                          <ChevronRightIcon className="size-4 text-ink-muted/60" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[14px] text-ink-muted">No bill yet. Enter it when their invoice arrives.</p>
              )}
            </Panel>
          ) : null}
          {po.notes ? (
            <Panel title="Notes">
              <p className="text-sm whitespace-pre-line">{po.notes}</p>
            </Panel>
          ) : null}
          <RecentActivity entityId={id} />
        </div>
      </div>
    </>
  );
}
