import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { customers, quotes } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { SoftTag, TierTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { OrdersTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { QUOTE_STATUS_LABEL } from "@/lib/stages";

export const metadata: Metadata = { title: "Quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = ["draft", "sent", "accepted", "declined"].includes(params.status ?? "") ? (params.status as "draft") : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ q: quotes, customerName: customers.name, customerTier: customers.tier })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(and(status ? eq(quotes.status, status) : undefined, q ? or(ilike(quotes.number, likeTerm(q)), ilike(customers.name, likeTerm(q))) : undefined))
      .orderBy(desc(quotes.createdAt))
      .limit(200),
    db.select({ total: count() }).from(quotes),
  ]);
  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <LinkButton href="/orders/quotes/new">
            <PlusIcon />
            New quote
          </LinkButton>
        }
      />
      <OrdersTabs />
      {total === 0 ? (
        <EmptyState
          title="No quotes yet"
          sentence="Price a job for a school or spa before they commit. When they say yes, one tap turns it into an order."
          action={
            <LinkButton href="/orders/quotes/new">
              <PlusIcon />
              Make your first quote
            </LinkButton>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by quote number or customer" />
            <FilterChips
              base="/orders/quotes"
              params={params}
              name="status"
              options={[{ label: "All" }, { value: "draft", label: "Draft" }, { value: "sent", label: "Sent" }, { value: "accepted", label: "Accepted" }, { value: "declined", label: "Declined" }]}
            />
          </div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map(({ q: quote, customerName, customerTier }) => (
                <li key={quote.id}>
                  <Link href={`/orders/quotes/${quote.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink-muted">{quote.number}</span>
                        <SoftTag className={quote.status === "accepted" ? "border-leaf/50 bg-leaf/15 text-[#4d7a12]" : quote.status === "sent" ? "border-sky/40 bg-sky/10 text-[#00739e]" : undefined}>
                          {QUOTE_STATUS_LABEL[quote.status]}
                        </SoftTag>
                        <span className="text-[12px] text-ink-muted">{formatISODate(quote.quoteDate)}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-2 truncate text-[16px] font-semibold">
                        {customerName}
                        {customerTier === "vip" ? <TierTag tier="vip" /> : null}
                      </p>
                    </div>
                    <p className="tabular hidden text-[15px] font-semibold sm:block">{formatFils(quote.totalFils)}</p>
                    <ChevronRightIcon className="size-5 text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState sentence={q ? `No quote matches "${q}".` : "No quotes with this status."} action={<LinkButton href="/orders/quotes/new">New quote</LinkButton>} />
          )}
        </>
      )}
    </>
  );
}
