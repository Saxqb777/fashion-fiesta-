import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon, PhoneIcon } from "lucide-react";
import { setCustomerArchived } from "@/actions/customers";
import { db } from "@/db";
import { customerBranches, customerMeasurements, customers, quotes, salesOrders } from "@/db/schema";
import { StageTag } from "@/components/orders/bits";
import { getMeasurementFields } from "@/lib/measurements";
import { formatFils } from "@/lib/money";
import { formatISODate } from "@/lib/dates";
import { QUOTE_STATUS_LABEL, orderNo } from "@/lib/stages";
import { CopyIcon, PlusIcon } from "lucide-react";
import { Measurements } from "./measurements";
import { ArchiveButton } from "@/components/data/archive-button";
import { BackLink, Facts, Panel } from "@/components/data/detail";
import { Flash } from "@/components/data/flash";
import { RecentActivity } from "@/components/data/recent-activity";
import { ArchivedTag, SoftTag, TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { CUSTOMER_TYPE_LABEL, telHref } from "@/lib/labels";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Branches } from "./branches";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const customer = /^[0-9a-f-]{36}$/.test(id) ? await db.query.customers.findFirst({ where: eq(customers.id, id) }) : undefined;
  if (!customer) notFound();
  const [settings, branches, sets, fields, orders, quoteRows] = await Promise.all([
    getSettings(),
    db.query.customerBranches.findMany({
      where: and(eq(customerBranches.customerId, id), isNull(customerBranches.deletedAt)),
      orderBy: asc(customerBranches.name),
    }),
    db
      .select()
      .from(customerMeasurements)
      .where(and(eq(customerMeasurements.customerId, id), isNull(customerMeasurements.deletedAt)))
      .orderBy(asc(customerMeasurements.label)),
    getMeasurementFields(),
    db.select().from(salesOrders).where(eq(salesOrders.customerId, id)).orderBy(desc(salesOrders.createdAt)).limit(8),
    db.select().from(quotes).where(and(eq(quotes.customerId, id))).orderBy(desc(quotes.createdAt)).limit(5),
  ]);
  const archived = Boolean(customer.deletedAt);
  const credit =
    customer.type === "retail" && customer.creditDays === null
      ? "Pays at the counter"
      : `${customer.creditDays ?? settings.defaultCreditDays} days`;

  return (
    <>
      <Flash added={`${customer.name} added.`} saved="Changes saved." />
      <BackLink href="/customers" label="Customers" />

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <TierTag tier={customer.tier} />
          <SoftTag>{CUSTOMER_TYPE_LABEL[customer.type]}</SoftTag>
          {archived ? <ArchivedTag /> : null}
        </div>
        <h1 className="mt-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">{customer.name}</h1>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-5 flex flex-wrap gap-2">
          {customer.phone ? (
            <LinkButton href={telHref(customer.phone)} variant="outline">
              <PhoneIcon />
              Call {customer.phone}
            </LinkButton>
          ) : null}
          <LinkButton href={`/customers/${customer.id}/edit`} variant={customer.phone ? "ghost" : "outline"}>
            <PencilIcon />
            Edit
          </LinkButton>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <Facts
              items={[
                { label: "Phone", value: customer.phone },
                { label: "Email", value: customer.email },
                { label: "Credit", value: credit, hint: customer.creditDays === null && customer.type === "wholesale" ? "Shop default" : undefined },
                { label: "TRN", value: customer.trn ? <span className="tabular">{customer.trn}</span> : null },
                { label: "Address", value: customer.address },
                { label: "Notes", value: customer.notes ? <span className="whitespace-pre-line">{customer.notes}</span> : null },
              ]}
            />
            {!customer.phone && !customer.email && !customer.address && !customer.notes ? (
              <p className="text-sm text-ink-muted">Only the name is saved. Add a phone number so you can call them from here.</p>
            ) : null}
          </Panel>
          <Measurements
            customerId={customer.id}
            fields={fields.map((f) => f.name)}
            sets={sets.map((m) => ({ id: m.id, label: m.label, values: m.values, notes: m.notes, createdAt: m.createdAt.toISOString() }))}
          />
          {customer.type === "wholesale" || branches.length ? <Branches customerId={customer.id} branches={branches} /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Panel
            title="Orders"
            action={
              <LinkButton href={`/orders/new?customer=${customer.id}`} variant="outline" size="sm">
                <PlusIcon />
                New order
              </LinkButton>
            }
          >
            {orders.length || quoteRows.some((q) => q.status !== "accepted") ? (
              <ul className="flex flex-col divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 py-2.5 first:pt-0">
                    <Link href={`/orders/${o.id}`} className="tabular flex-1 text-[15px] font-semibold hover:underline">
                      {orderNo(o.number)}
                      <span className="ml-2 text-[12px] font-medium text-ink-muted">{formatISODate(o.orderDate)}</span>
                    </Link>
                    <StageTag stage={o.stage} />
                    <span className="tabular hidden w-24 text-right text-sm sm:inline">{formatFils(o.totalFils, { currency: false })}</span>
                    <LinkButton href={`/orders/new?copy=${o.id}`} variant="ghost" size="icon-sm" aria-label={`Order ${orderNo(o.number)} again`} title="Order again">
                      <CopyIcon className="text-ink-muted" />
                    </LinkButton>
                  </li>
                ))}
                {quoteRows
                  .filter((q) => q.status !== "accepted")
                  .map((q) => (
                    <li key={q.id} className="flex items-center gap-2 py-2.5">
                      <Link href={`/orders/quotes/${q.id}`} className="tabular flex-1 text-[15px] font-semibold hover:underline">
                        {q.number}
                        <span className="ml-2 text-[12px] font-medium text-ink-muted">Quote, {QUOTE_STATUS_LABEL[q.status].toLowerCase()}</span>
                      </Link>
                      <span className="tabular hidden w-24 text-right text-sm sm:inline">{formatFils(q.totalFils, { currency: false })}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No orders yet. What they owe you arrives in Phase 3.</p>
            )}
          </Panel>
          <RecentActivity entityId={customer.id} relatedIds={[...branches.map((b) => b.id), ...sets.map((m) => m.id)]} />
          <div className="flex justify-end">
            <ArchiveButton action={setCustomerArchived} id={customer.id} archived={archived} noun="customer" />
          </div>
        </div>
      </div>
    </>
  );
}
