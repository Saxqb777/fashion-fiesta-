import type { Metadata } from "next";
import { and, count, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesOrders, soLines, tasks } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { TaskCard } from "@/components/workshop/task-card";
import { formatLongDate, todayISO } from "@/lib/dates";
import { dueSummary } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { taskCardColumns, taskOrder } from "@/lib/task-queries";

export const metadata: Metadata = { title: "Today" };

type Item = { key: string; text: string; detail?: string; href: string; action: string; urgent?: boolean };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function TodayPage() {
  const user = await requireUser();
  const owner = user.role === "owner";
  const today = todayISO();

  if (!owner) {
    const mine = await db
      .select(taskCardColumns)
      .from(tasks)
      .innerJoin(soLines, eq(soLines.id, tasks.soLineId))
      .innerJoin(salesOrders, eq(salesOrders.id, tasks.orderId))
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(and(eq(tasks.tailorId, user.id), inArray(tasks.status, ["assigned", "in_progress", "rejected"])))
      .orderBy(...taskOrder());
    const overdue = mine.filter((t) => t.dueDate && t.dueDate < today).length;
    const sentBack = mine.filter((t) => t.status === "rejected").length;
    return (
      <>
        <PageHeader eyebrow={formatLongDate(new Date())} title="Today" />
        {mine.length ? (
          <>
            <p className="mb-4 text-[17px]">
              {plural(mine.length, "task", "tasks")} to do
              {overdue ? <span className="font-semibold text-brand">, {overdue} overdue</span> : null}
              {sentBack ? <span className="font-semibold text-brand-deep">, {sentBack} sent back to fix</span> : null}.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {mine.slice(0, 4).map((t) => (
                <TaskCard key={t.id} t={t} />
              ))}
            </ul>
            {mine.length > 4 ? (
              <LinkButton href="/workshop" size="lg" className="mt-4 w-full sm:w-auto">
                See all my tasks
              </LinkButton>
            ) : null}
          </>
        ) : (
          <EmptyState sentence="Nothing assigned to you right now. New work shows up here as a photo card." action={<LinkButton href="/workshop/gallery" variant="outline">See the Gallery</LinkButton>} />
        )}
      </>
    );
  }

  const [[review], [questions], [declined], [overdue], [ready], [drafts], [toInvoice], due] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(eq(tasks.status, "submitted")),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.openQuestion, true), ne(tasks.status, "approved"))),
    db.select({ n: count() }).from(tasks).where(eq(tasks.status, "declined")),
    db.select({ n: count() }).from(tasks).where(and(ne(tasks.status, "approved"), lt(tasks.dueDate, today))),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "ready")),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "draft")),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "delivered")),
    dueSummary(),
  ]);
  const items: Item[] = [
    due.overdueCount && {
      key: "unpaid",
      text: `${formatFils(due.overdueFils)} is overdue`,
      detail: `${plural(due.overdueCount, "invoice is", "invoices are")} past the due date.`,
      href: "/money",
      action: "See who owes",
      urgent: true,
    },
    overdue.n && { key: "overdue", text: `${plural(overdue.n, "task is", "tasks are")} overdue`, href: "/workshop", action: "See overdue", urgent: true },
    questions.n && { key: "questions", text: `${plural(questions.n, "question", "questions")} from the workshop`, href: "/workshop?view=questions", action: "Answer" },
    review.n && { key: "review", text: `${plural(review.n, "piece of work", "pieces of work")} waiting for your review`, href: "/workshop?view=review", action: "Review" },
    declined.n && { key: "declined", text: `${plural(declined.n, "task was", "tasks were")} declined`, detail: "Give them to someone else.", href: "/workshop?view=declined", action: "Reassign" },
    ready.n && { key: "ready", text: `${plural(ready.n, "order is", "orders are")} ready to hand over`, href: "/orders?view=ready", action: "Open" },
    toInvoice.n && { key: "invoice", text: `${plural(toInvoice.n, "order is", "orders are")} delivered but not invoiced`, href: "/orders?view=invoice", action: "Invoice" },
    due.weekCount && {
      key: "week",
      text: `${formatFils(due.weekFils)} falls due this week`,
      detail: `${plural(due.weekCount, "invoice", "invoices")} due in the next 7 days.`,
      href: "/money/invoices?show=open",
      action: "See invoices",
    },
    drafts.n && { key: "drafts", text: `${plural(drafts.n, "draft order is", "draft orders are")} waiting to be confirmed`, href: "/orders?view=drafts", action: "Review" },
  ].filter(Boolean) as Item[];

  return (
    <>
      <PageHeader eyebrow={formatLongDate(new Date())} title="Today" />
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-muted">
          Cash in hand <span className="ml-1 font-medium text-ink-muted/70">cash book</span>
        </p>
        <p className="tabular mt-2 font-display text-[3rem] leading-none font-medium sm:text-[4rem]">{formatFils(0)}</p>
        <p className="mt-3 text-[13px] text-ink-muted">Starts counting in Phase 5, when the cash book arrives.</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-medium">Needs your attention</h2>
        {items.length ? (
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 sm:px-5">
                <span className={i.urgent ? "size-2.5 shrink-0 rounded-full bg-brand" : "size-2.5 shrink-0 rounded-full bg-line"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{i.text}</p>
                  {i.detail ? <p className="text-[13px] text-ink-muted">{i.detail}</p> : null}
                </div>
                <LinkButton href={i.href} variant={i.urgent ? "default" : "outline"}>
                  {i.action}
                </LinkButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            sentence="Nothing needs you right now. When a customer comes in, make a new order. For a school or business, start with a quote."
            action={<LinkButton href="/orders/new" variant="outline">New order</LinkButton>}
          />
        )}
      </section>
    </>
  );
}
