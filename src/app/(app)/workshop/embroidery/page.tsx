import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { customers, embroideryJobs, operatorSettlements } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SoftTag } from "@/components/data/tags";
import { SettleButton } from "@/components/embroidery/embroidery-actions";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { WorkshopTabs } from "@/components/section-navs";
import { formatISODate, todayISO } from "@/lib/dates";
import { operatorBalance, splitOf } from "@/lib/embroidery";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Embroidery" };

export default async function EmbroideryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const show = params.show === "done" ? "done" : params.show === "all" ? "all" : undefined;
  const [s, balance, rows, settlements, [counts]] = await Promise.all([
    getSettings(),
    operatorBalance(),
    db
      .select({ j: embroideryJobs, customerName: customers.name })
      .from(embroideryJobs)
      .leftJoin(customers, eq(customers.id, embroideryJobs.customerId))
      .where(show === "all" ? undefined : eq(embroideryJobs.status, show === "done" ? "done" : "to_do"))
      .orderBy(desc(embroideryJobs.jobDate), desc(embroideryJobs.createdAt))
      .limit(300),
    db.select().from(operatorSettlements).orderBy(desc(operatorSettlements.settleDate), desc(operatorSettlements.createdAt)).limit(6),
    db.select({ todo: sql<number>`count(*) filter (where ${embroideryJobs.status} = 'to_do')::int`, all: sql<number>`count(*)::int` }).from(embroideryJobs),
  ]);
  const who = s.embroideryOperatorName || "The operator";

  return (
    <>
      <PageHeader
        title="Workshop"
        actions={
          <LinkButton href="/workshop/embroidery/new">
            <PlusIcon />
            New job
          </LinkButton>
        }
      />
      <WorkshopTabs owner />

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 sm:flex-row sm:items-end sm:p-6">
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink-muted">
            {who}, embroidery <span className="ml-1 font-medium text-ink-muted/70">{s.embroideryShopSharePercent}% to the shop</span>
          </p>
          <p className="tabular mt-2 font-display text-[2.5rem] leading-none font-medium">{formatFils(Math.abs(balance))}</p>
          <p className="mt-2 text-[15px] font-semibold">{balance > 0 ? `The shop owes ${who}.` : balance < 0 ? `${who} owes the shop.` : "All settled."}</p>
          <p className="text-[13px] text-ink-muted">From done jobs, after what was already settled.</p>
        </div>
        <SettleButton balanceFils={balance} operatorName={who} today={todayISO()} />
      </section>
      {settlements.length ? (
        <p className="tabular mt-2 text-[13px] text-ink-muted">
          Last settled:{" "}
          {settlements
            .slice(0, 3)
            .map((x) => `${formatISODate(x.settleDate)} ${x.direction === "to_operator" ? "paid" : "received"} ${formatFils(x.amountFils)}`)
            .join(" · ")}
        </p>
      ) : null}

      <div className="mt-6 mb-3">
        <FilterChips
          base="/workshop/embroidery"
          params={{ show }}
          name="show"
          options={[
            { label: "To do", count: counts.todo },
            { value: "done", label: "Done" },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ j, customerName }) => {
            const split = splitOf(j);
            return (
              <li key={j.id}>
                <Link href={`/workshop/embroidery/${j.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-ink/20 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SoftTag className={j.side === "shop" ? undefined : "border-magenta/25 bg-magenta/10 text-magenta"}>{j.side === "shop" ? "Shop's customer" : `${who}'s customer`}</SoftTag>
                      {j.status === "done" ? <SoftTag className="border-leaf/50 bg-leaf/15 text-[#4d7a12]">Done</SoftTag> : null}
                      <span className="text-[12px] text-ink-muted">{formatISODate(j.jobDate)}</span>
                    </div>
                    <p className="mt-1 truncate text-[16px] font-semibold">
                      {customerName ?? j.customerName}
                      <span className="ml-2 text-[14px] font-medium text-ink-muted">
                        {j.description}, {j.pieces} {j.pieces === 1 ? "piece" : "pieces"}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-display text-lg font-medium">{formatFils(j.priceFils)}</p>
                    <p className="tabular text-[12px] text-ink-muted">{j.side === "shop" ? `${who} ${formatFils(split.operator, { currency: false })}` : `Shop ${formatFils(split.shop, { currency: false })}`}</p>
                  </div>
                  <ChevronRightIcon className="size-5 text-ink-muted/60" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          sentence={show ? "Nothing here yet." : "Nothing waiting for the machine. Add a job with the design file, and the 50/50 balance keeps itself."}
          action={<LinkButton href="/workshop/embroidery/new">Add a job</LinkButton>}
        />
      )}
    </>
  );
}
