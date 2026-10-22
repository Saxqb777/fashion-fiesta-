import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MapPinIcon } from "lucide-react";
import { db } from "@/db";
import { customers, fabrics, salesOrders, soLines, taskMessages, taskPhotos, tasks } from "@/db/schema";
import { BackLink, Panel } from "@/components/data/detail";
import { DueChip, MeasurementGrid, TaskStatusTag } from "@/components/orders/bits";
import { Progress } from "@/components/orders/bits";
import {
  AnswerForm,
  ApprovalCelebration,
  OwnerReview,
  ProgressStepper,
  ReassignForm,
  SubmitWork,
  TailorMore,
  UnitReceive,
} from "@/components/workshop/task-actions";
import { TIME_ZONE } from "@/lib/defaults";
import { assigneeNames, editorLookups } from "@/lib/editor-data";
import { requireUser } from "@/lib/session";
import { cn } from "cn";
import { orderNo } from "@/lib/stages";

export const metadata: Metadata = { title: "Task" };

const when = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MESSAGE_LABEL = { question: "asked", answer: "answered", declined: "declined", rejected: "sent back", approved: "approved", note: "" } as const;

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const owner = me.role === "owner";
  const { id } = await params;
  const task = /^[0-9a-f-]{36}$/.test(id) ? await db.query.tasks.findFirst({ where: eq(tasks.id, id) }) : undefined;
  if (!task || (!owner && task.tailorId !== me.id)) notFound();

  const [line, order, photos, messages, names] = await Promise.all([
    db.query.soLines.findFirst({ where: eq(soLines.id, task.soLineId) }),
    db.query.salesOrders.findFirst({ where: eq(salesOrders.id, task.orderId) }),
    db.select().from(taskPhotos).where(eq(taskPhotos.taskId, id)).orderBy(asc(taskPhotos.createdAt)),
    db.select().from(taskMessages).where(eq(taskMessages.taskId, id)).orderBy(asc(taskMessages.createdAt)),
    assigneeNames(),
  ]);
  if (!line || !order) notFound();
  const [customer, fabric, lookups] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, order.customerId), columns: { name: true, id: true } }),
    line.fabricId ? db.query.fabrics.findFirst({ where: eq(fabrics.id, line.fabricId) }) : undefined,
    owner ? editorLookups() : null,
  ]);
  const assignee = names.get((task.tailorId ?? task.supplierId)!) ?? "Someone";
  const open = ["assigned", "in_progress", "rejected"].includes(task.status);
  const lastReject = [...messages].reverse().find((m) => m.kind === "rejected");
  const isTailorView = !owner && task.assigneeType === "tailor";
  const latestPhoto = photos.at(-1);

  return (
    <>
      <BackLink href="/workshop" label={owner ? "Workshop" : "My tasks"} />
      <ApprovalCelebration approvedAt={task.status === "approved" ? (task.approvedAt?.toISOString() ?? null) : null} />

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusTag status={task.status} />
          <DueChip date={task.dueDate} done={task.status === "approved"} />
        </div>
        <h1 className="mt-3 text-[1.875rem] leading-[1.1] font-medium md:text-[2.25rem]">{line.description}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">
          {owner ? (
            <Link href={`/orders/${order.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
              {orderNo(order.number)}
            </Link>
          ) : (
            orderNo(order.number)
          )}{" "}
          · {customer?.name} · {owner ? `${assignee}${task.assigneeType === "unit" ? ", stitching unit" : ""}` : `${task.qty} pieces`}
        </p>
      </header>

      {task.status === "rejected" && lastReject ? (
        <div className="mb-4 rounded-[14px] border-2 border-brand/30 bg-brand-soft px-4 py-3">
          <p className="text-[13px] font-bold tracking-wide text-brand-deep uppercase">Sent back</p>
          <p className="mt-1 text-[16px] text-ink">{lastReject.body}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          {isTailorView && open ? (
            <>
              <ProgressStepper taskId={task.id} qty={task.qty} qtyDone={task.qtyDone} />
              <SubmitWork taskId={task.id} qty={task.qty} />
              <TailorMore taskId={task.id} canDecline={task.status !== "rejected"} />
            </>
          ) : null}

          {isTailorView && task.status === "submitted" ? (
            <Panel>
              <p className="text-[15px]">Submitted. The owner is checking it.</p>
            </Panel>
          ) : null}

          {owner && task.status === "submitted" ? <OwnerReview taskId={task.id} /> : null}
          {owner && task.assigneeType === "unit" && task.status !== "approved" && task.status !== "declined" ? (
            <UnitReceive taskId={task.id} qty={task.qty} qtyDone={task.qtyDone} />
          ) : null}
          {owner && task.assigneeType === "tailor" && open ? (
            <Panel title="Progress">
              <Progress done={task.qtyDone} total={task.qty} />
            </Panel>
          ) : null}
          {owner && task.openQuestion ? (
            <Panel title="Answer the question">
              <AnswerForm taskId={task.id} />
            </Panel>
          ) : null}
          {owner && lookups && task.status !== "submitted" && task.status !== "approved" ? (
            <Panel title={task.status === "declined" ? "Give it to someone else" : "Reassign"}>
              {task.status !== "declined" && task.qtyDone > 0 ? (
                <p className="mb-3 text-[13px] text-ink-muted">Reassigning starts the count again at 0.</p>
              ) : null}
              <ReassignForm taskId={task.id} tailors={lookups.tailors} units={lookups.units} current={(task.tailorId ?? task.supplierId) ?? undefined} />
            </Panel>
          ) : null}

          {photos.length ? (
            <Panel title="Photos">
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id} className="relative overflow-hidden rounded-[10px] bg-paper-deep">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                    </a>
                    {p.kind === "submission" ? (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-bold">Finished</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {line.measurements?.length ? (
            <Panel title={`Measurements: ${line.measurementLabel}`}>
              <MeasurementGrid values={line.measurements} />
            </Panel>
          ) : null}
          {fabric ? (
            <Panel title="Fabric">
              <div className="flex items-center gap-3">
                {fabric.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fabric.photoUrl} alt="" className="size-20 rounded-[10px] object-cover" />
                ) : null}
                <div>
                  <p className="text-[16px] font-semibold">{[fabric.name, fabric.colour].filter(Boolean).join(", ")}</p>
                  {fabric.shelfLocation ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[15px] font-semibold text-brand">
                      <MapPinIcon className="size-4" />
                      {fabric.shelfLocation}
                    </p>
                  ) : null}
                  {fabric.code ? <p className="text-[13px] text-ink-muted">Code {fabric.code}</p> : null}
                </div>
              </div>
            </Panel>
          ) : null}
          {line.notes ? (
            <Panel title="Notes from the order">
              <p className="text-[15px] whitespace-pre-line">{line.notes}</p>
            </Panel>
          ) : null}
          {messages.length ? (
            <Panel title="Messages">
              <ol className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "rounded-[12px] px-3.5 py-2.5 text-[15px]",
                      m.kind === "question" || m.kind === "declined" ? "bg-paper-deep" : m.kind === "rejected" ? "bg-brand-soft" : m.kind === "approved" ? "bg-leaf/15" : "border border-line",
                    )}
                  >
                    <p className="text-[12px] font-semibold text-ink-muted">
                      {m.authorName} {MESSAGE_LABEL[m.kind]} · {when.format(m.createdAt)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
          {!owner && latestPhoto && task.status === "approved" ? (
            <Panel>
              <p className="text-[15px]">Approved and in the Gallery. Well done.</p>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
