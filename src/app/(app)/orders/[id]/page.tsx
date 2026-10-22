import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRightIcon, CopyIcon, MapPinIcon, PencilIcon } from "lucide-react";
import { db } from "@/db";
import { customerBranches, customers, fabrics, quotes, salesOrders, soLines, taskPhotos, tasks } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Panel } from "@/components/data/detail";
import { Flash } from "@/components/data/flash";
import { RecentActivity } from "@/components/data/recent-activity";
import { TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { DueChip, MeasurementGrid, Progress, TaskStatusTag } from "@/components/orders/bits";
import { OrderStageButton } from "@/components/orders/order-actions";
import { StageTracker } from "@/components/orders/stage-tracker";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/dates";
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
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const approved = ts.filter((t) => t.status === "approved").reduce((s, t) => s + t.qty, 0);
  const done = ts.reduce((s, t) => s + t.qtyDone, 0);
  const unassigned = lines.reduce((s, l) => s + Math.max(0, l.qty - ts.filter((t) => t.soLineId === l.id).reduce((a, t) => a + t.qty, 0)), 0);
  const editable = ["confirmed", "stitching", "ready"].includes(order.stage);
  const tracker = order.stage === "cancelled" ? "confirmed" : order.stage;

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
      <OrderStageButton orderId={order.id} to="delivered" label="Mark delivered" />
    ) : order.stage === "delivered" ? (
      <Button size="lg" disabled>
        Make invoice, Phase 3
      </Button>
    ) : null;

  return (
    <>
      <Flash added={`Order ${order.number} saved.`} saved="Order updated." />
      <BackLink href="/orders" label="Orders" />
      <header className="mb-5">
        <p className="tabular text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          {order.number} · {formatShortDate(new Date(`${order.orderDate}T00:00:00`))}
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
          <DueChip date={order.dueDate} done={!editable || order.stage === "ready"} />
          {editable ? (
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

      <StageTracker current={tracker} action={nextAction} />

      {pieces ? (
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
                    <DueChip date={l.dueDate ?? order.dueDate} done={lineTasks.length > 0 && lineTasks.every((t) => t.status === "approved")} />
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
                  {assigned < l.qty ? (
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
