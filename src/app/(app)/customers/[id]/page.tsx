import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon, PhoneIcon } from "lucide-react";
import { setCustomerArchived } from "@/actions/customers";
import { db } from "@/db";
import { customerBranches, customers } from "@/db/schema";
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
  const [settings, branches] = await Promise.all([
    getSettings(),
    db.query.customerBranches.findMany({
      where: and(eq(customerBranches.customerId, id), isNull(customerBranches.deletedAt)),
      orderBy: asc(customerBranches.name),
    }),
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
          {customer.type === "wholesale" || branches.length ? <Branches customerId={customer.id} branches={branches} /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Orders and money">
            <p className="text-sm text-ink-muted">Orders arrive in Phase 2. What they owe you arrives in Phase 3.</p>
          </Panel>
          <RecentActivity entityId={customer.id} relatedIds={branches.map((b) => b.id)} />
          <div className="flex justify-end">
            <ArchiveButton action={setCustomerArchived} id={customer.id} archived={archived} noun="customer" />
          </div>
        </div>
      </div>
    </>
  );
}
