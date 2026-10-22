import type { OrderStage, QuoteStatus, TaskStatus } from "@/db/schema";

export const STAGES = ["quote", "confirmed", "stitching", "ready", "delivered", "invoiced", "paid"] as const;
export type TrackerStage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<TrackerStage | "cancelled" | "draft", string> = {
  draft: "Draft",
  quote: "Quote",
  confirmed: "Confirmed",
  stitching: "Stitching",
  ready: "Ready",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Not started",
  in_progress: "In progress",
  submitted: "Waiting for review",
  approved: "Approved",
  rejected: "Needs rework",
  declined: "Declined",
};

/** Tasks whose work has started cannot be moved or deleted. */
export function taskLocked(t: { status: TaskStatus; qtyDone: number }) {
  return !(t.status === "assigned" || t.status === "declined") || t.qtyDone > 0;
}

const RANK: Partial<Record<OrderStage, number>> = { confirmed: 0, stitching: 1, ready: 2 };

/** Drafts have no number until confirmed. */
export function orderNo(number: string | null | undefined) {
  return number ?? "Draft";
}

/** Moves an order forward from its tasks. Never moves it back. */
export function computeStage(
  current: OrderStage,
  lines: { id: string; qty: number }[],
  tasks: { soLineId: string; qty: number; qtyDone: number; status: TaskStatus }[],
): OrderStage {
  if (RANK[current] === undefined) return current;
  const fullyApproved =
    lines.length > 0 &&
    lines.every((l) => tasks.filter((t) => t.soLineId === l.id && t.status === "approved").reduce((s, t) => s + t.qty, 0) >= l.qty);
  const anyProgress = tasks.some((t) => t.qtyDone > 0 || ["in_progress", "submitted", "approved", "rejected"].includes(t.status));
  const computed: OrderStage = fullyApproved ? "ready" : anyProgress ? "stitching" : "confirmed";
  return (RANK[computed] ?? 0) > (RANK[current] ?? 0) ? computed : current;
}
