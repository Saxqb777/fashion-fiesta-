import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { db } from "@/db";
import { customerBranches, customers, quoteLines, quotes, salesOrders } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { BackLink, Panel } from "@/components/data/detail";
import { Flash } from "@/components/data/flash";
import { RecentActivity } from "@/components/data/recent-activity";
import { SoftTag, TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { QuoteStatusButton } from "@/components/orders/quote-status-buttons";
import { StageTracker } from "@/components/orders/stage-tracker";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { QUOTE_STATUS_LABEL } from "@/lib/stages";

export const metadata: Metadata = { title: "Quote" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const quote = /^[0-9a-f-]{36}$/.test(id) ? await db.query.quotes.findFirst({ where: eq(quotes.id, id) }) : undefined;
  if (!quote) notFound();
  const [customer, branch, lines, order] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, quote.customerId) }),
    quote.branchId ? db.query.customerBranches.findFirst({ where: eq(customerBranches.id, quote.branchId) }) : undefined,
    db.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).orderBy(asc(quoteLines.sort)),
    quote.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, quote.orderId), columns: { id: true, number: true } }) : undefined,
  ]);
  const open = quote.status !== "accepted";

  return (
    <>
      <Flash added={`Quote ${quote.number} saved.`} saved="Quote updated." />
      <BackLink href="/orders/quotes" label="Quotes" />
      <header className="mb-5">
        <p className="tabular text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          {quote.number} · {formatISODate(quote.quoteDate)}
          {quote.validUntil ? ` · valid until ${formatISODate(quote.validUntil)}` : ""}
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          <Link href={`/customers/${quote.customerId}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {customer?.name}
          </Link>
          {customer?.tier === "vip" ? <TierTag tier="vip" /> : null}
        </h1>
        {branch ? <p className="mt-1 text-[15px] text-ink-muted">{branch.name}</p> : null}
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SoftTag>{QUOTE_STATUS_LABEL[quote.status]}</SoftTag>
          {open ? (
            <>
              <LinkButton href={`/orders/quotes/${id}/edit`} variant="outline" size="sm">
                <PencilIcon />
                Edit
              </LinkButton>
              {quote.status !== "sent" ? <QuoteStatusButton id={id} status="sent" label="Mark as sent" /> : null}
              {quote.status !== "declined" ? <QuoteStatusButton id={id} status="declined" label="They said no" /> : <QuoteStatusButton id={id} status="draft" label="Back to draft" />}
            </>
          ) : null}
        </div>
      </header>

      <StageTracker
        current={open ? "quote" : "confirmed"}
        action={
          open ? (
            <LinkButton href={`/orders/new?fromQuote=${id}`} size="lg">
              Confirm as order
            </LinkButton>
          ) : order ? (
            <LinkButton href={`/orders/${order.id}`} size="lg" variant="outline">
              Open order {order.number}
            </LinkButton>
          ) : null
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Lines">
          <ul className="flex flex-col divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{l.description}</p>
                  <p className="tabular text-[13px] text-ink-muted">
                    {l.qty} × {formatFils(l.unitPriceFils, { currency: false })}
                  </p>
                  {l.notes ? <p className="mt-1 text-[13px] text-ink-muted">{l.notes}</p> : null}
                </div>
                <p className="tabular shrink-0 font-semibold">{formatFils(l.netFils + l.vatFils)}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="flex flex-col gap-4">
          <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatFils(quote.subtotalFils)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">VAT</dt>
              <dd>{formatFils(quote.vatFils)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-display text-2xl font-medium">{formatFils(quote.totalFils)}</dd>
            </div>
          </dl>
          <p className="text-[13px] text-ink-muted">The printable quote arrives in Phase 3 with the other documents.</p>
          <RecentActivity entityId={quote.id} />
        </div>
      </div>
    </>
  );
}
