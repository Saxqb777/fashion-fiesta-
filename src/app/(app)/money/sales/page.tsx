import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { posSales, users } from "@/db/schema";
import { SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Quick sales" };

export default async function QuickSalesPage() {
  await requireOwner();
  const today = todayISO();
  const [rows, [t]] = await Promise.all([
    db.select({ s: posSales, seller: users.name }).from(posSales).innerJoin(users, eq(users.id, posSales.soldBy)).orderBy(desc(posSales.saleDate), desc(posSales.createdAt)).limit(300),
    db
      .select({
        cash: sql<number>`coalesce(sum(${posSales.totalFils}) filter (where ${posSales.method} = 'cash'), 0)::int`,
        card: sql<number>`coalesce(sum(${posSales.totalFils}) filter (where ${posSales.method} = 'card'), 0)::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(posSales)
      .where(eq(posSales.saleDate, today)),
  ]);
  return (
    <>
      <PageHeader
        title="Money"
        actions={
          <LinkButton href="/today/sale">
            <PlusIcon />
            Quick sale
          </LinkButton>
        }
      />
      <MoneyTabs />
      {rows.length ? (
        <>
          <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">Sold at the counter today</p>
            <p className="tabular mt-2 font-display text-[2.5rem] leading-none font-medium">{formatFils(t.cash + t.card)}</p>
            <p className="tabular mt-2 text-[14px] text-ink-muted">
              {t.n} {t.n === 1 ? "sale" : "sales"}. Cash {formatFils(t.cash)}, card {formatFils(t.card)}.
            </p>
          </section>
          <ul className="mt-6 flex flex-col gap-2">
            {rows.map(({ s, seller }) => (
              <li key={s.id}>
                <Link href={`/today/sale/${s.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-ink/20 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[13px] font-semibold text-ink-muted">{s.number}</span>
                      <SoftTag>{s.method === "card" ? "Card" : "Cash"}</SoftTag>
                      <span className="text-[12px] text-ink-muted">{formatISODate(s.saleDate)}</span>
                    </div>
                    <p className="mt-1 truncate text-[16px] font-semibold">
                      {s.customerName ?? "Walk in"}
                      <span className="ml-2 text-[13px] font-medium text-ink-muted">by {seller}</span>
                    </p>
                  </div>
                  <p className="tabular font-display text-lg font-medium">{formatFils(s.totalFils)}</p>
                  <ChevronRightIcon className="size-5 text-ink-muted/60" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState title="No quick sales yet" sentence="Ready made pieces and small jobs paid at the counter. Owners and tailors can sell from their phone." action={<LinkButton href="/today/sale">Make the first sale</LinkButton>} />
      )}
    </>
  );
}
