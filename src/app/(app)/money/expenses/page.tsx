import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { POT_LABEL } from "@/lib/cash";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Expenses" };

const monthName = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export default async function ExpensesPage() {
  await requireOwner();
  const rows = await db
    .select({ e: expenses, category: expenseCategories.name })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(400);
  const thisMonth = todayISO().slice(0, 7);
  const byCategory = await db
    .select({ name: expenseCategories.name, n: sql<number>`coalesce(sum(${expenses.amountFils}), 0)::int` })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(sql`to_char(${expenses.expenseDate}, 'YYYY-MM') = ${thisMonth}`)
    .groupBy(expenseCategories.name)
    .orderBy(sql`2 desc`);
  const monthTotal = byCategory.reduce((s, c) => s + c.n, 0);
  const months = [...new Set(rows.map((r) => r.e.expenseDate.slice(0, 7)))];

  return (
    <>
      <PageHeader
        title="Money"
        actions={
          <LinkButton href="/money/expenses/new">
            <PlusIcon />
            New expense
          </LinkButton>
        }
      />
      <MoneyTabs />
      {rows.length ? (
        <>
          <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">Spent in {monthName(thisMonth)}</p>
            <p className="tabular mt-2 font-display text-[2.5rem] leading-none font-medium">{formatFils(monthTotal)}</p>
            {byCategory.length ? (
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
                {byCategory.map((c) => (
                  <li key={c.name} className="tabular">
                    <span className="text-ink-muted">{c.name}</span> <span className="font-semibold">{formatFils(c.n, { currency: false })}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          {months.map((m) => (
            <section key={m} className="mt-6">
              <h2 className="mb-2 text-lg font-medium">{monthName(m)}</h2>
              <ul className="flex flex-col gap-2">
                {rows
                  .filter((r) => r.e.expenseDate.startsWith(m))
                  .map(({ e, category }) => (
                    <li key={e.id}>
                      <Link href={`/money/expenses/${e.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-ink/20 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <SoftTag>{category}</SoftTag>
                            <span className="text-[12px] text-ink-muted">
                              {formatISODate(e.expenseDate)} · {POT_LABEL[e.pot]}
                            </span>
                            {e.vatFils ? <span className="tabular text-[12px] text-[#4d7a12]">VAT {formatFils(e.vatFils, { currency: false })}</span> : null}
                          </div>
                          <p className="mt-1 truncate text-[16px] font-semibold">
                            {e.description}
                            {e.payee ? <span className="ml-2 text-[13px] font-medium text-ink-muted">{e.payee}</span> : null}
                          </p>
                        </div>
                        <p className="tabular font-display text-lg font-medium">{formatFils(e.amountFils)}</p>
                        <ChevronRightIcon className="size-5 text-ink-muted/60" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <EmptyState title="No expenses yet" sentence="Rent, bills, thread, taxis: record what goes out and the cash book stays true." action={<LinkButton href="/money/expenses/new">Record the first expense</LinkButton>} />
      )}
    </>
  );
}
