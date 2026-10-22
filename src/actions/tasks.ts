"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { salesOrders, suppliers, taskMessages, taskPhotos, taskReviews, tasks, users, type Task } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { text, type FormState } from "@/lib/forms";
import { flashDone } from "@/lib/flash";
import { refreshOrderStage } from "@/lib/order-stage";
import { recordPiecesOnPo, unitPoLineFor } from "@/lib/unit-pieces";
import { requireOwner, requireUser } from "@/lib/session";

type Actor = Awaited<ReturnType<typeof requireUser>>;
const photoUrl = z.string().trim().startsWith("https://", "Take a photo first.");

/** Loads a task the current user may act on. Tailors only reach their own. */
async function loadTask(id: string, actor: Actor): Promise<{ task?: Task; orderNumber?: string; error?: string }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "That task no longer exists." };
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return { error: "That task no longer exists." };
  if (actor.role !== "owner" && task.tailorId !== actor.id) return { error: "This task is not yours." };
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, task.orderId), columns: { number: true } });
  return { task, orderNumber: order?.number ?? "a draft order" };
}

function refresh(task: Task) {
  revalidatePath(`/workshop/tasks/${task.id}`);
  revalidatePath("/workshop");
  revalidatePath("/workshop/gallery");
  revalidatePath(`/orders/${task.orderId}`);
  revalidatePath("/orders");
  revalidatePath("/today");
}

async function message(task: Task, actor: Actor, kind: typeof taskMessages.$inferInsert.kind, body: string) {
  await db.insert(taskMessages).values({ taskId: task.id, kind, body, authorName: actor.name ?? null, createdBy: actor.id });
}

/* ---------- Tailor ---------- */

export async function updateProgress(input: { taskId: string; qtyDone: number; photoUrl?: string }): Promise<{ error?: string; qtyDone?: number }> {
  const me = await requireUser();
  const { task, orderNumber, error } = await loadTask(input.taskId, me);
  if (!task) return { error };
  if (!["assigned", "in_progress", "rejected"].includes(task.status)) return { error: "This task is not open for progress." };
  const qtyDone = Math.max(0, Math.min(task.qty, Math.round(input.qtyDone)));
  await db.update(tasks).set({ qtyDone, status: "in_progress" }).where(eq(tasks.id, task.id));
  if (input.photoUrl && photoUrl.safeParse(input.photoUrl).success) {
    await db.insert(taskPhotos).values({ taskId: task.id, url: input.photoUrl, kind: "progress", createdBy: me.id });
  }
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "updated", summary: `${me.name}: ${qtyDone} of ${task.qty} done on ${orderNumber}` });
  await refreshOrderStage(task.orderId);
  refresh(task);
  return { qtyDone };
}

export async function submitTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (!["assigned", "in_progress", "rejected"].includes(task.status)) return { message: "This task is already submitted." };
  const photo = photoUrl.safeParse(text(fd, "photoUrl"));
  if (!photo.success) return { message: "Take a photo of the finished work first. A task cannot be submitted without one." };
  await db.update(tasks).set({ status: "submitted", qtyDone: task.qty, submittedAt: new Date(), openQuestion: false }).where(eq(tasks.id, task.id));
  await db.insert(taskPhotos).values({ taskId: task.id, url: photo.data, kind: "submission", createdBy: me.id });
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "status_changed", summary: `${me.name} submitted ${task.qty} pieces on ${orderNumber}` });
  await notify("owners", { kind: "task_submitted", title: `${me.name} finished work on ${orderNumber}`, body: `${task.qty} pieces to review.`, href: `/workshop/tasks/${task.id}` }, me.id);
  await refreshOrderStage(task.orderId);
  refresh(task);
  return flashDone("Submitted. The owner will review it.");
}

export async function askQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  const body = text(fd, "body");
  if (body.length < 3) return { errors: { body: ["Type your question."] } };
  await message(task, me, "question", body.slice(0, 1000));
  await db.update(tasks).set({ openQuestion: true }).where(eq(tasks.id, task.id));
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "updated", summary: `${me.name} asked a question on ${orderNumber}` });
  await notify("owners", { kind: "task_question", title: `${me.name} has a question on ${orderNumber}`, body: body.slice(0, 140), href: `/workshop/tasks/${task.id}` }, me.id);
  refresh(task);
  return flashDone("Question sent.");
}

export async function declineTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (!["assigned", "in_progress", "rejected"].includes(task.status)) return { message: "This task can no longer be declined." };
  const reason = text(fd, "reason");
  if (reason.length < 3) return { errors: { reason: ["Say why, so the owner can reassign it."] } };
  await message(task, me, "declined", reason.slice(0, 1000));
  await db.update(tasks).set({ status: "declined", openQuestion: false }).where(eq(tasks.id, task.id));
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "status_changed", summary: `${me.name} declined a task on ${orderNumber}` });
  await notify("owners", { kind: "task_declined", title: `${me.name} declined a task on ${orderNumber}`, body: reason.slice(0, 140), href: `/workshop/tasks/${task.id}` }, me.id);
  refresh(task);
  return flashDone("Declined. The owner will reassign it.");
}

/* ---------- Owner ---------- */

export async function answerQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const { task, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  const body = text(fd, "body");
  if (body.length < 1) return { errors: { body: ["Type your answer."] } };
  await message(task, me, "answer", body.slice(0, 1000));
  await db.update(tasks).set({ openQuestion: false }).where(eq(tasks.id, task.id));
  if (task.tailorId) await notify([task.tailorId], { kind: "task_answer", title: "Your question was answered", body: body.slice(0, 140), href: `/workshop/tasks/${task.id}` }, me.id);
  refresh(task);
  return flashDone("Answer sent.");
}

export async function approveTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (task.status !== "submitted") return { message: "Only submitted work can be approved." };
  await db.update(tasks).set({ status: "approved", approvedAt: new Date() }).where(eq(tasks.id, task.id));
  await db.insert(taskReviews).values({ taskId: task.id, decision: "approved", createdBy: me.id });
  await message(task, me, "approved", "Approved.");
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "status_changed", summary: `${me.name} approved ${task.qty} pieces on ${orderNumber}` });
  if (task.tailorId) await notify([task.tailorId], { kind: "task_approved", title: "Your work was approved", body: `${task.qty} pieces on ${orderNumber}. It is in the Gallery.`, href: `/workshop/tasks/${task.id}` }, me.id);
  await refreshOrderStage(task.orderId);
  refresh(task);
  await flashDone("Approved. Added to the Gallery.");
  redirect(`/workshop/tasks/${task.id}?celebrate=approved`);
}

export async function rejectTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (task.status !== "submitted") return { message: "Only submitted work can be rejected." };
  const reason = text(fd, "reason");
  if (reason.length < 3) return { errors: { reason: ["Say what needs fixing."] } };
  await db.update(tasks).set({ status: "rejected" }).where(eq(tasks.id, task.id));
  await db.insert(taskReviews).values({ taskId: task.id, decision: "rejected", reason, createdBy: me.id });
  await message(task, me, "rejected", reason.slice(0, 1000));
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "status_changed", summary: `${me.name} sent work back on ${orderNumber}: ${reason}` });
  if (task.tailorId) await notify([task.tailorId], { kind: "task_rejected", title: `Sent back to fix: ${orderNumber}`, body: reason.slice(0, 140), href: `/workshop/tasks/${task.id}` }, me.id);
  refresh(task);
  return flashDone("Sent back with your reason.");
}

export async function reassignTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (task.status === "submitted" || task.status === "approved") return { message: "Finished work cannot be reassigned." };
  const [type, id] = text(fd, "assignee").split(":");
  let name: string | undefined;
  if (type === "tailor") {
    const u = await db.query.users.findFirst({ where: and(eq(users.id, id ?? ""), eq(users.isActive, true), isNull(users.deletedAt)) });
    name = u?.name;
  } else if (type === "unit") {
    const s = await db.query.suppliers.findFirst({ where: and(eq(suppliers.id, id ?? ""), eq(suppliers.type, "outsourcing"), isNull(suppliers.deletedAt)) });
    name = s?.name;
  }
  if (!name) return { errors: { assignee: ["Pick who does this now."] } };
  await db
    .update(tasks)
    .set({
      assigneeType: type as "tailor" | "unit",
      tailorId: type === "tailor" ? id : null,
      supplierId: type === "unit" ? id : null,
      status: "assigned",
      qtyDone: 0,
      openQuestion: false,
    })
    .where(eq(tasks.id, task.id));
  await message(task, me, "note", `Reassigned to ${name}.`);
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "updated", summary: `${me.name} reassigned a task on ${orderNumber} to ${name}` });
  if (type === "tailor" && id) await notify([id], { kind: "task_assigned", title: `New task on ${orderNumber}`, body: `${task.qty} pieces.`, href: `/workshop/tasks/${task.id}` }, me.id);
  refresh(task);
  return flashDone(`Reassigned to ${name}.`);
}

/** Stitching units have no login. The owner records what came back. */
export async function receiveUnitWork(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const { task, orderNumber, error } = await loadTask(text(fd, "taskId"), me);
  if (!task) return { message: error };
  if (task.assigneeType !== "unit") return { message: "This task is for a tailor." };
  if (task.status === "approved") return { message: "All pieces are already received." };
  const qty = Number(text(fd, "qtyDone"));
  if (!Number.isInteger(qty) || qty < 0 || qty > task.qty) return { errors: { qtyDone: [`Between 0 and ${task.qty}.`] } };
  // The unit's PO may already show pieces back; the task cannot go below that.
  const link = await unitPoLineFor(task.id);
  if (link && qty < link.backPieces) return { errors: { qtyDone: [`The PO ${link.po.number} already shows ${link.backPieces} back.`] } };
  const photo = text(fd, "photoUrl");
  if (photo && photoUrl.safeParse(photo).success) {
    await db.insert(taskPhotos).values({ taskId: task.id, url: photo, kind: qty === task.qty ? "submission" : "progress", createdBy: me.id });
  }
  const done = qty === task.qty;
  await db
    .update(tasks)
    .set({ qtyDone: qty, status: done ? "approved" : "in_progress", ...(done ? { approvedAt: new Date(), submittedAt: new Date() } : {}) })
    .where(eq(tasks.id, task.id));
  if (done) await db.insert(taskReviews).values({ taskId: task.id, decision: "approved", createdBy: me.id });
  await recordPiecesOnPo(task.id, qty, me.id);
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "updated", summary: `${me.name} received ${qty} of ${task.qty} pieces from the unit on ${orderNumber}` });
  if (link) revalidatePath(`/purchases/orders/${link.po.id}`);
  await refreshOrderStage(task.orderId);
  refresh(task);
  return flashDone(done ? "All pieces received." : `${qty} of ${task.qty} received.`);
}
