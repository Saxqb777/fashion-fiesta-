import type { Metadata } from "next";
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import Link from "next/link";
import { customers, dailyCloses, posSales, quotes, salesOrders, soLines, tasks } from "@/db/schema";
import { NoticeList } from "@/components/notifications/notice-list";
import { PhoneSetup } from "@/components/pwa/phone-setup";
import { quietCustomers } from "@/lib/health";
import { recentNotices } from "@/lib/notices";
import { CountUp } from "@/components/money/count-up";
import { potBalances } from "@/lib/cash";
import { payDayWarning } from "@/lib/salaries";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { TaskCard } from "@/components/workshop/task-card";
import { addDaysISO, formatLongDate, todayISO } from "@/lib/dates";
import { dueSummary } from "@/lib/ledger";
import { lowStockFabrics, payablesDue } from "@/lib/payables";
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
    const mySales = await db
      .select({ id: posSales.id, number: posSales.number, totalFils: posSales.totalFils, method: posSales.method })
      .from(posSales)
      .where(and(eq(posSales.soldBy, user.id!), eq(posSales.saleDate, today)))
      .orderBy(desc(posSales.createdAt));
    const notices = await recentNotices(user.id!, 5);
    return (
      <>
        <PageHeader
          eyebrow={formatLongDate(new Date())}
          title="Today"
          actions={
            <LinkButton href="/today/sale" size="lg" variant="outline" className="h-12">
              <PlusIcon />
              Quick sale
            </LinkButton>
          }
        />
        {mySales.length ? (
          <p className="tabular -mt-2 mb-5 text-[15px]">
            You sold {formatFils(mySales.reduce((s, x) => s + x.totalFils, 0))} today.{" "}
            {mySales.slice(0, 3).map((x, i) => (
              <span key={x.id}>
                {i ? ", " : ""}
                <Link href={`/today/sale/${x.id}`} className="font-semibold underline-offset-2 hover:underline">
                  {x.number}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
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
        <NoticeList notices={notices} />
        <div className="mt-6">
          <PhoneSetup />
        </div>
      </>
    );
  }

  const [[review], [questions], [declined], [overdue], [ready], [drafts], [toInvoice], due, pay, low] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(eq(tasks.status, "submitted")),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.openQuestion, true), ne(tasks.status, "approved"))),
    db.select({ n: count() }).from(tasks).where(eq(tasks.status, "declined")),
    db.select({ n: count() }).from(tasks).where(and(ne(tasks.status, "approved"), lt(tasks.dueDate, today))),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "ready")),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "draft")),
    db.select({ n: count() }).from(salesOrders).where(eq(salesOrders.stage, "delivered")),
    dueSummary(),
    payablesDue(),
    lowStockFabrics(),
  ]);
  const yesterday = addDaysISO(today, -1);
  const [balances, todayClose, payDay, lastClose, [staleQuotes], quiet, notices] = await Promise.all([
    potBalances(),
    db.query.dailyCloses.findFirst({ where: eq(dailyCloses.closeDate, today) }),
    payDayWarning(today),
    db.query.dailyCloses.findFirst({ where: eq(dailyCloses.closeDate, yesterday) }),
    // Quotes sent a week ago or more with no answer, still valid.
    db
      .select({ n: count() })
      .from(quotes)
      .where(and(eq(quotes.status, "sent"), lte(quotes.quoteDate, addDaysISO(today, -7)), or(isNull(quotes.validUntil), gte(quotes.validUntil, today)))),
    quietCustomers(today),
    recentNotices(user.id!, 8),
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
    pay.overdueCount && {
      key: "bills-late",
      text: `${formatFils(pay.overdueFils)} to suppliers is past the pay by date`,
      detail: `${plural(pay.overdueCount, "bill", "bills")} late.`,
      href: "/purchases/owe",
      action: "See who you owe",
      urgent: true,
    },
    pay.weekCount && {
      key: "bills-week",
      text: `${formatFils(pay.weekFils)} to pay suppliers this week`,
      detail: `${plural(pay.weekCount, "bill", "bills")} due in the next 7 days.`,
      href: "/purchases/bills?show=open",
      action: "See bills",
    },
    low.length && {
      key: "low-stock",
      text: low.length === 1 ? `${low[0].name} is running low` : `${low.length} fabrics are running low`,
      detail: low.map((f) => `${f.name}: ${(f.stockCenti / 100).toFixed(2)} m`).slice(0, 3).join(". ") + ".",
      href: low.length === 1 ? `/purchases/fabrics/${low[0].id}` : "/purchases/fabrics",
      action: "Order more",
    },
    payDay && {
      key: "pay-day",
      text: payDay.soonest < 0 ? `Salaries are late: ${formatFils(payDay.totalFils)}` : payDay.soonest === 0 ? `Pay day today: ${formatFils(payDay.totalFils)}` : `Pay day in ${plural(payDay.soonest, "day", "days")}: ${formatFils(payDay.totalFils)}`,
      detail: `${plural(payDay.count, "person", "people")}, after advances. Check the drawer has it.`,
      href: "/settings/team",
      action: "Pay salaries",
      urgent: payDay.soonest <= 0,
    },
    lastClose?.differenceFils && {
      key: "close-diff",
      text: `Yesterday's close was ${lastClose.differenceFils > 0 ? "over" : "short"} by ${formatFils(Math.abs(lastClose.differenceFils))}`,
      detail: lastClose.notes ?? "Counted cash did not match the cash book.",
      href: "/money/cash",
      action: "See the cash book",
      urgent: lastClose.differenceFils < 0,
    },
    staleQuotes.n && {
      key: "stale-quotes",
      text: `${plural(staleQuotes.n, "quote has", "quotes have")} had no answer for a week`,
      detail: "A short follow up often wins the order.",
      href: "/orders/quotes?status=sent",
      action: "Follow up",
    },
    quiet.length && {
      key: "quiet",
      text: quiet.length === 1 ? `${quiet[0].name} has not ordered for 90 days` : `${quiet.length} customers have not ordered for 90 days`,
      detail: quiet
        .slice(0, 3)
        .map((c) => c.name)
        .join(", "),
      href: quiet.length === 1 ? `/customers/${quiet[0].customerId}` : "/reports/customers?show=quiet",
      action: quiet.length === 1 ? "Open" : "See who",
    },
    drafts.n && { key: "drafts", text: `${plural(drafts.n, "draft order is", "draft orders are")} waiting to be confirmed`, href: "/orders?view=drafts", action: "Review" },
  ].filter(Boolean) as Item[];

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(new Date())}
        title="Today"
        actions={
          <LinkButton href="/today/sale" variant="outline">
            <PlusIcon />
            Quick sale
          </LinkButton>
        }
      />
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-muted">
          Cash in hand <span className="ml-1 font-medium text-ink-muted/70">cash book</span>
        </p>
        <p className="tabular mt-2 font-display text-[3rem] leading-none font-medium sm:text-[4rem]">
          <CountUp fils={balances.cash} />
        </p>
        <p className="tabular mt-3 text-[14px] text-ink-muted">
          {formatFils(balances.bank)} in the bank.{" "}
          <Link href="/money/cash" className="font-semibold text-ink underline-offset-2 hover:underline">
            {todayClose ? "Day closed" : "Close the day"}
          </Link>
        </p>
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
      <NoticeList notices={notices} />
      <div className="mt-6">
        <PhoneSetup />
      </div>
    </>
  );
}
