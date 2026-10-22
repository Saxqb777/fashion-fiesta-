import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRightIcon, CopyIcon, MapPinIcon, PencilIcon } from "lucide-react";
import { db } from "@/db";
import { customerBranches, customers, deliveryNoteLines, deliveryNotes, fabrics, invoices, payments, quotes, salesOrders, soLines, taskPhotos, tasks } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Panel } from "@/components/data/detail";
import { Flash } from "@/components/data/flash";
import { RecentActivity } from "@/components/data/recent-activity";
import { TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { InvoiceStatusTag } from "@/components/money/bits";
import { Celebrate } from "@/components/money/celebrate";
import { SendDoc } from "@/components/money/send-doc";
import { WalkInPay } from "@/components/money/walk-in-pay";
import { DueChip, MeasurementGrid, Progress, TaskStatusTag } from "@/components/orders/bits";
import { DeleteDraftButton, OrderStageButton } from "@/components/orders/order-actions";
import { orderNo } from "@/lib/stages";
import { StageTracker } from "@/components/orders/stage-tracker";
import { formatISODate, formatShortDate } from "@/lib/dates";
import { sendDocProps } from "@/lib/doc-links";
import { METHOD_LABEL, invoiceFigures, invoiceStatus, unallocatedByPayment } from "@/lib/ledger";
import { lineAmounts } from "@/lib/lines";
import { orderLineProgress } from "@/lib/order-progress";
import { getSettings } from "@/lib/settings";
import { assigneeNames } from "@/lib/editor-data";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const order = /^[0-9a-f-]{36}$/.test(id) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) }) : undefined;
  if (!order) notFound();
  const [customer, branch, lines, ts, names, quote] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, order.customerId) }),
    order.branchId ? db.query.customerBranches.findFirst({ where: eq(customerBranches.id, order.branchId) }) : undefined,
    db.select().from(soLines).where(eq(soLines.orderId, id)).orderBy(asc(soLines.sort)),
    db.select().from(tasks).where(eq(tasks.orderId, id)).orderBy(asc(tasks.createdAt)),
    assigneeNames(),
    order.quoteId ? db.query.quotes.findFirst({ where: eq(quotes.id, order.quoteId), columns: { id: true, number: true } }) : undefined,
  ]);
  const fabricIds = lines.map((l) => l.fabricId).filter(Boolean) as string[];
  const [fabricRows, photos] = await Promise.all([
    fabricIds.length ? db.select().from(fabrics).where(inArray(fabrics.id, fabricIds)) : [],
    ts.length ? db.select().from(taskPhotos).where(inArray(taskPhotos.taskId, ts.map((t) => t.id))) : [],
  ]);
  const fabricById = new Map(fabricRows.map((f) => [f.id, f]));
  const [progress, dns, invs, pays, credit, st] = await Promise.all([
    orderLineProgress(id),
    db.select().from(deliveryNotes).where(eq(deliveryNotes.orderId, id)).orderBy(asc(deliveryNotes.createdAt)),
    db.select().from(invoices).where(eq(invoices.orderId, id)).orderBy(asc(invoices.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.paymentDate)),
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.customerId, order.customerId), eq(payments.isDeposit, false))),
    getSettings(),
  ]);
  const dnPieces = dns.length
    ? await db
        .select({ dn: deliveryNoteLines.deliveryNoteId, qty: deliveryNoteLines.qty })
        .from(deliveryNoteLines)
        .where(inArray(deliveryNoteLines.deliveryNoteId, dns.map((d) => d.id)))
    : [];
  const [figures, left] = await Promise.all([invoiceFigures(invs.map((i) => i.id)), unallocatedByPayment([...pays.map((p) => p.id), ...credit.map((c) => c.id)])]);
  const depositLeft = pays.filter((p) => p.isDeposit).reduce((sum, p) => sum + Math.max(0, left.get(p.id) ?? 0), 0);
  const creditLeft = credit.reduce((sum, c) => sum + Math.max(0, left.get(c.id) ?? 0), 0);
  const invFig = invs.map((i) => figures.get(i.id)!);
  const paidOnInvoices = invFig.reduce((sum, f) => sum + f.paidFils, 0);
  const credited = invFig.reduce((sum, f) => sum + f.creditedFils, 0);
  const stillToPay = Math.max(0, order.totalFils - credited - paidOnInvoices - depositLeft);
  const leftToDeliver = progress.some((l) => l.qty - l.delivered > 0) && !order.deliveredAt;
  const leftToInvoice = progress.filter((l) => l.qty - l.invoiced > 0);
  const walkInTotal = leftToInvoice.reduce((sum, l) => sum + lineAmounts(l.qty - l.invoiced, l.unitPriceFils, st.vatRateBp).totalFils, 0);
  const walkInDue = walkInTotal - Math.min(walkInTotal, depositLeft + creditLeft);
  const isRetail = customer?.type === "retail";
  const openInvoice = invs.find((i) => (figures.get(i.id)?.balanceFils ?? 0) > 0);
  const phone = customer?.phone;
  const [orderSend, dnSends, invSends] = await Promise.all([
    order.number
      ? sendDocProps("order", id, { phone, filename: `${order.number} ${customer?.name ?? ""}`, message: `${st.tradeName}: order ${order.number} confirmed, ${formatFils(order.totalFils)}. Thank you.` })
      : null,
    Promise.all(dns.map((d) => sendDocProps("delivery", d.id, { phone, filename: `${d.number} ${customer?.name ?? ""}`, message: `${st.tradeName}: delivery note ${d.number} for order ${order.number}.` }))),
    Promise.all(
      invs
        .filter((i) => i.number)
        .map((i) =>
          sendDocProps("invoice", i.id, {
            phone,
            filename: `${i.number} ${customer?.name ?? ""}`,
            message: `${st.tradeName}: Tax Invoice ${i.number} for ${formatFils(i.totalFils)}, due by ${formatISODate(i.dueDate, true)}. Thank you.`,
          }),
        ),
    ),
  ]);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const approved = ts.filter((t) => t.status === "approved").reduce((s, t) => s + t.qty, 0);
  const done = ts.reduce((s, t) => s + t.qtyDone, 0);
  const unassigned = lines.reduce((s, l) => s + Math.max(0, l.qty - ts.filter((t) => t.soLineId === l.id).reduce((a, t) => a + t.qty, 0)), 0);
  const isDraft = order.stage === "draft";
  const editable = ["confirmed", "stitching", "ready"].includes(order.stage);
  const tracker = order.stage === "cancelled" || order.stage === "draft" ? "confirmed" : order.stage;

  const walkIn = isRetail && leftToInvoice.length && walkInDue > 0 ? <WalkInPay orderId={order.id} amountFils={walkInDue} variant="outline" /> : null;
  const nextAction =
    order.stage === "confirmed" || order.stage === "stitching" ? (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <OrderStageButton
          orderId={order.id}
          to="ready"
          label="Mark ready"
          confirmText={approved < pieces ? `${approved} of ${pieces} pieces are approved. Mark the order ready anyway?` : undefined}
        />
        <span className="text-[12px] text-ink-muted">
          {unassigned ? `${unassigned} pieces not assigned yet. ` : ""}It turns ready by itself when all work is approved.
        </span>
      </div>
    ) : order.stage === "ready" ? (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {walkIn}
        {leftToDeliver ? (
          <LinkButton href={`/orders/${order.id}/deliver`} size="lg">
            Make delivery note
          </LinkButton>
        ) : null}
      </div>
    ) : order.stage === "delivered" ? (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {walkIn}
        {leftToInvoice.length ? (
          <LinkButton href={`/money/invoices/new?order=${order.id}`} size="lg">
            Make invoice
          </LinkButton>
        ) : null}
      </div>
    ) : order.stage === "invoiced" && openInvoice ? (
      <LinkButton href={`/money/payments/new?customer=${order.customerId}&invoice=${openInvoice.id}`} size="lg">
        Record payment
      </LinkButton>
    ) : order.stage === "paid" ? (
      <span className="inline-flex h-11 items-center rounded-full bg-leaf/15 px-5 text-[15px] font-semibold text-[#4d7a12]">Paid in full</span>
    ) : null;

  return (
    <>
      <Celebrate />
      <Flash added={`Order ${orderNo(order.number)} confirmed.`} saved="Order updated." draft="Draft saved. Confirm it when you are ready." />
      <BackLink href="/orders" label="Orders" />
      <header className="mb-5">
        <p className="tabular text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          {order.number ?? "Draft order"} · {formatShortDate(new Date(`${order.orderDate}T00:00:00`))}
          {order.customerPoNumber ? ` · Customer PO ${order.customerPoNumber}` : ""}
          {quote ? (
            <>
              {" "}
              · from{" "}
              <Link href={`/orders/quotes/${quote.id}`} className="underline underline-offset-2">
                {quote.number}
              </Link>
            </>
          ) : null}
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          <Link href={`/customers/${order.customerId}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
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
          {editable || isDraft ? <DueChip date={order.dueDate} done={order.stage === "ready"} /> : null}
          {editable && !isDraft ? (
            <LinkButton href={`/orders/${order.id}/edit`} variant="outline" size="sm">
              <PencilIcon />
              Edit
            </LinkButton>
          ) : null}
          <LinkButton href={`/orders/new?copy=${order.id}`} variant="ghost" size="sm">
            <CopyIcon />
            Order again
          </LinkButton>
        </div>
      </header>

      {isDraft ? (
        <section className="rounded-[14px] border-2 border-dashed border-ink/20 bg-surface p-5">
          <h2 className="text-xl font-medium">Draft order</h2>
          <p className="mt-1 max-w-prose text-[15px] text-ink-muted">
            Not confirmed yet. It has no order number, no tailor tasks, and it is not counted in any report. Review it and confirm when the customer is sure.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <LinkButton href={`/orders/${order.id}/edit`} size="lg">
              Review and confirm
            </LinkButton>
            <DeleteDraftButton orderId={order.id} />
          </div>
        </section>
      ) : (
        <StageTracker current={tracker} action={nextAction} />
      )}

      {pieces && !isDraft ? (
        <div className="mt-4 rounded-[14px] border border-line bg-surface p-4 sm:p-5">
          <p className="mb-2 text-sm font-semibold">Pieces approved</p>
          <Progress done={done} approved={approved} total={pieces} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const lineTasks = ts.filter((t) => t.soLineId === l.id);
            const fabric = l.fabricId ? fabricById.get(l.fabricId) : undefined;
            const assigned = lineTasks.reduce((s, t) => s + t.qty, 0);
            return (
              <Panel key={l.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular text-[12px] font-semibold text-ink-muted">Line {i + 1}</p>
                    <h2 className="text-xl font-medium">{l.description}</h2>
                    <p className="tabular mt-0.5 text-sm text-ink-muted">
                      {l.qty} × {formatFils(l.unitPriceFils, { currency: false })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="tabular font-display text-xl font-medium">{formatFils(l.netFils + l.vatFils)}</p>
                    {editable && (progress.find((p) => p.id === l.id)?.delivered ?? 0) < l.qty ? (
                      <DueChip date={l.dueDate ?? order.dueDate} done={lineTasks.length > 0 && lineTasks.every((t) => t.status === "approved")} />
                    ) : null}
                  </div>
                </div>
                {l.notes ? <p className="mt-3 rounded-[10px] bg-paper-deep/60 px-3 py-2 text-sm whitespace-pre-line">{l.notes}</p> : null}
                {fabric ? (
                  <div className="mt-3 flex items-center gap-3">
                    {fabric.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fabric.photoUrl} alt="" className="size-12 rounded-[10px] object-cover" />
                    ) : null}
                    <p className="text-sm">
                      <span className="font-semibold">{[fabric.name, fabric.colour].filter(Boolean).join(", ")}</span>
                      {fabric.shelfLocation ? <span className="text-ink-muted"> · {fabric.shelfLocation}</span> : null}
                    </p>
                  </div>
                ) : null}
                {l.measurements?.length ? (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">Measurements: {l.measurementLabel}</p>
                    <MeasurementGrid values={l.measurements} />
                  </div>
                ) : null}
                <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
                  {lineTasks.map((t) => {
                    const photo = photos.filter((p) => p.taskId === t.id).at(-1);
                    return (
                      <Link key={t.id} href={`/workshop/tasks/${t.id}`} className="group flex items-center gap-3 rounded-[10px] px-1 py-1.5 hover:bg-paper-deep/60">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo.url} alt="" className="size-10 shrink-0 rounded-[8px] object-cover" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold">{names.get((t.tailorId ?? t.supplierId)!) ?? "Someone"}</span>
                            {t.assigneeType === "unit" ? <span className="text-[12px] text-ink-muted">stitching unit</span> : null}
                            <TaskStatusTag status={t.status} />
                            {t.openQuestion ? <span className="text-[12px] font-semibold text-magenta">Question waiting</span> : null}
                          </div>
                          <Progress done={t.qtyDone} approved={t.status === "approved" ? t.qty : 0} total={t.qty} size="sm" className="mt-1.5 max-w-xs" />
                        </div>
                        <ChevronRightIcon className="size-4 text-ink-muted/60" />
                      </Link>
                    );
                  })}
                  {isDraft
                    ? (l.draftAssignments ?? []).map((a, j) => (
                        <p key={j} className="flex items-center gap-2 text-[15px]">
                          <span className="font-semibold">{names.get(a.assigneeId) ?? "Someone"}</span>
                          <span className="tabular text-ink-muted">{a.qty} pieces</span>
                          <span className="rounded-full border border-dashed border-ink/30 px-2 py-0.5 text-[11px] font-bold tracking-wide text-ink-muted uppercase">Planned</span>
                        </p>
                      ))
                    : null}
                  {!isDraft && assigned < l.qty ? (
                    <p className="text-[13px] font-semibold text-ink-muted">
                      {l.qty - assigned} not assigned.{" "}
                      {editable ? (
                        <Link href={`/orders/${order.id}/edit`} className="text-brand underline-offset-2 hover:underline">
                          Assign
                        </Link>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
        <div className="flex flex-col gap-4">
          <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatFils(order.subtotalFils)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">VAT</dt>
              <dd>{formatFils(order.vatFils)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-display text-2xl font-medium">{formatFils(order.totalFils)}</dd>
            </div>
          </dl>
          {!isDraft && order.stage !== "cancelled" ? (
            <Panel
              title="Money"
              action={
                order.stage !== "paid" && order.stage !== "invoiced" ? (
                  <LinkButton href={`/money/payments/new?order=${order.id}&deposit=1`} variant="outline" size="sm">
                    Take a deposit
                  </LinkButton>
                ) : null
              }
            >
              <dl className="tabular flex flex-col gap-1.5 text-[15px]">
                {pays.some((p) => p.isDeposit) ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Paid in advance</dt>
                    <dd className="text-[#4d7a12]">{formatFils(pays.filter((p) => p.isDeposit).reduce((sum, p) => sum + p.amountFils, 0))}</dd>
                  </div>
                ) : null}
                {invs.length ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Invoiced</dt>
                    <dd>{formatFils(invs.reduce((sum, i) => sum + i.totalFils, 0))}</dd>
                  </div>
                ) : null}
                {credited ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Credit notes</dt>
                    <dd>{formatFils(-credited)}</dd>
                  </div>
                ) : null}
                {paidOnInvoices - invFig.reduce((sum, f) => sum + f.advanceFils, 0) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Paid</dt>
                    <dd className="text-[#4d7a12]">{formatFils(paidOnInvoices - invFig.reduce((sum, f) => sum + f.advanceFils, 0))}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <dt className="font-semibold">Still to pay</dt>
                  <dd className="font-display text-xl font-medium">{formatFils(stillToPay)}</dd>
                </div>
              </dl>
            </Panel>
          ) : null}
          {orderSend ? (
            <Panel title="Documents">
              <ul className="flex flex-col divide-y divide-line">
                <li className="flex flex-col gap-2 pb-3">
                  <p className="text-[14px] font-semibold">Order confirmation {order.number}</p>
                  <SendDoc {...orderSend} />
                </li>
                {dns.map((d, i) => (
                  <li key={d.id} className="flex flex-col gap-2 py-3">
                    <p className="text-[14px] font-semibold">
                      Delivery note {d.number}
                      <span className="tabular ml-2 font-normal text-ink-muted">
                        {formatISODate(d.deliveryDate, true)} · {dnPieces.filter((x) => x.dn === d.id).reduce((sum, x) => sum + x.qty, 0)} pieces
                      </span>
                    </p>
                    <SendDoc {...dnSends[i]} />
                  </li>
                ))}
                {invs
                  .filter((inv) => inv.number)
                  .map((inv, i) => (
                    <li key={inv.id} className="flex flex-col gap-2 py-3">
                      <Link href={`/money/invoices/${inv.id}`} className="flex flex-wrap items-center gap-2 text-[14px] font-semibold hover:underline">
                        Tax Invoice {inv.number}
                        <InvoiceStatusTag status={invoiceStatus(figures.get(inv.id)!, inv.dueDate)} />
                        <span className="tabular font-normal text-ink-muted">{formatFils(inv.totalFils)}</span>
                      </Link>
                      <SendDoc {...invSends[i]} />
                    </li>
                  ))}
                {pays.map((p) => (
                  <li key={p.id} className="py-3 last:pb-0">
                    <Link href={`/money/payments/${p.id}`} className="flex flex-wrap items-center gap-2 text-[14px] font-semibold hover:underline">
                      Receipt {p.number}
                      {p.isDeposit ? <span className="text-[12px] text-[#4d7a12]">Paid in advance</span> : null}
                      <span className="tabular font-normal text-ink-muted">
                        {formatFils(p.amountFils)} · {METHOD_LABEL[p.method]} · {formatISODate(p.paymentDate, true)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {order.notes ? (
            <Panel title="Notes">
              <p className="text-sm whitespace-pre-line">{order.notes}</p>
            </Panel>
          ) : null}
          <RecentActivity entityId={order.id} relatedIds={ts.map((t) => t.id)} />
        </div>
      </div>
    </>
  );
}
