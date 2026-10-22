import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon, PhoneIcon } from "lucide-react";
import { setCustomerArchived } from "@/actions/customers";
import { db } from "@/db";
import {
  customerBranches,
  customerMeasurements,
  customers,
  quotes,
  salesOrders,
} from "@/db/schema";
import { StageTag } from "@/components/orders/bits";
import {
  getMeasurementFields,
  getMeasurementTemplates,
} from "@/lib/measurements";
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
import { AgingBar } from "@/components/money/bits";
import { agingByCustomer } from "@/lib/ledger";
import { keyAccountData, pendingByBranch } from "@/lib/accounts";
import {
  AccountTabs,
  ACCOUNT_TABS,
  type AccountTab,
} from "@/components/accounts/account-tabs";
import {
  AccountOrders,
  AccountReport,
} from "@/components/accounts/account-views";
import { BranchBoard } from "@/components/accounts/branch-board";
import { Catalogue } from "@/components/accounts/catalogue";
import { Deliveries } from "@/components/accounts/deliveries";
import { EmirateStrip } from "@/components/accounts/emirate-strip";
import { KeyAccountSwitch } from "@/components/accounts/key-account-switch";
import { StaffBoard } from "@/components/accounts/staff-board";
import { EMIRATES } from "@/lib/emirates";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const customer = /^[0-9a-f-]{36}$/.test(id)
    ? await db.query.customers.findFirst({ where: eq(customers.id, id) })
    : undefined;
  if (!customer) notFound();
  const [
    settings,
    branches,
    sets,
    fields,
    orders,
    quoteRows,
    [money],
    templates,
  ] = await Promise.all([
    getSettings(),
    db.query.customerBranches.findMany({
      where: and(
        eq(customerBranches.customerId, id),
        isNull(customerBranches.deletedAt),
      ),
      orderBy: asc(customerBranches.name),
    }),
    db
      .select()
      .from(customerMeasurements)
      .where(
        and(
          eq(customerMeasurements.customerId, id),
          isNull(customerMeasurements.deletedAt),
        ),
      )
      .orderBy(asc(customerMeasurements.label)),
    getMeasurementFields(),
    db
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.customerId, id))
      .orderBy(desc(salesOrders.createdAt))
      .limit(8),
    db
      .select()
      .from(quotes)
      .where(and(eq(quotes.customerId, id)))
      .orderBy(desc(quotes.createdAt))
      .limit(5),
    agingByCustomer(id),
    getMeasurementTemplates(),
  ]);
  const late = money ? money.d1_30 + money.d31_60 + money.d61 : 0;
  const archived = Boolean(customer.deletedAt);
  const account = customer.isKeyAccount
    ? await keyAccountData(customer.id)
    : null;
  const tab: AccountTab =
    account && ACCOUNT_TABS.includes(sp.tab as AccountTab)
      ? (sp.tab as AccountTab)
      : "overview";
  const emirateGroups = account
    ? [...EMIRATES, null]
        .map((e) => ({
          emirate: e ?? "Not set",
          count: account.branches.filter((b) => (b.emirate ?? null) === e)
            .length,
        }))
        .filter((g) => g.count)
    : [];
  const waiting =
    account && tab === "overview"
      ? (
          await pendingByBranch(
            (
              await db
                .select({ id: salesOrders.id })
                .from(salesOrders)
                .where(and(eq(salesOrders.customerId, customer.id), notInArray(salesOrders.stage, ["draft", "cancelled"])))
            ).map((o) => o.id),
          )
        )
          .filter((p) => p.branchId)
          .reduce((s, p) => s + p.left, 0)
      : 0;
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
          {customer.isKeyAccount ? (
            <SoftTag className="border-brand/30 bg-brand-soft text-brand-deep">
              Key account
            </SoftTag>
          ) : null}
          <SoftTag>{CUSTOMER_TYPE_LABEL[customer.type]}</SoftTag>
          {archived ? <ArchivedTag /> : null}
        </div>
        <h1 className="mt-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">
          {customer.name}
        </h1>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-5 flex flex-wrap gap-2">
          {customer.phone ? (
            <LinkButton href={telHref(customer.phone)} variant="outline">
              <PhoneIcon />
              Call {customer.phone}
            </LinkButton>
          ) : null}
          <LinkButton
            href={`/customers/${customer.id}/edit`}
            variant={customer.phone ? "ghost" : "outline"}
          >
            <PencilIcon />
            Edit
          </LinkButton>
          {customer.type === "wholesale" &&
          !customer.isKeyAccount &&
          !archived ? (
            <KeyAccountSwitch
              customerId={customer.id}
              on={false}
              name={customer.name}
            />
          ) : null}
        </div>
      </header>

      {account ? (
        <AccountTabs
          customerId={customer.id}
          active={tab}
          counts={{
            branches: account.branches.length,
            staff: account.staff.length,
            catalogue: account.items.length,
            deliveries: account.runs.length,
          }}
        />
      ) : null}
      {account && tab === "branches" ? (
        <BranchBoard
          customerId={customer.id}
          customerName={customer.name}
          branches={account.branches}
          emirate={sp.emirate ?? null}
        />
      ) : null}
      {account && tab === "staff" ? (
        <StaffBoard
          customerId={customer.id}
          branches={account.branches.map((b) => ({ id: b.id, name: b.name }))}
          staff={account.staff}
        />
      ) : null}
      {account && tab === "catalogue" ? (
        <Catalogue customerId={customer.id} items={account.items} />
      ) : null}
      {account && tab === "orders" ? (
        <AccountOrders
          customerId={customer.id}
          params={sp}
          seasons={account.seasons}
          branches={account.branches.map((b) => ({ id: b.id, name: b.name }))}
        />
      ) : null}
      {account && tab === "deliveries" ? (
        <Deliveries
          customerId={customer.id}
          runs={account.runs}
          deliveryCompanies={account.deliveryCompanies}
        />
      ) : null}
      {account && tab === "report" ? (
        <AccountReport customerId={customer.id} />
      ) : null}

      {tab === "overview" ? (
        <>
          {account ? (
            <section className="mb-4 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-xl font-medium">The account</h2>
                <p className="text-[14px] text-ink-muted">
                  {account.branches.length}{" "}
                  {account.branches.length === 1 ? "branch" : "branches"} in{" "}
                  {emirateGroups.filter((g) => g.emirate !== "Not set").length}{" "}
                  {emirateGroups.length === 1 ? "emirate" : "emirates"}
                  {account.staff.length
                    ? `, ${account.staff.length} staff`
                    : ""}
                  {account.items.length
                    ? `, ${account.items.length} agreed prices`
                    : ""}
                  {waiting ? `, ${waiting} pieces waiting to go` : ""}
                </p>
              </div>
              {account.branches.length ? (
                <div className="mt-4">
                  <EmirateStrip
                    customerId={customer.id}
                    groups={emirateGroups}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[15px] text-ink-muted">
                  Start with their branches. Each one gets its own delivery
                  note.
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                {account.branches.some((b) => !b.verified) ? (
                  <LinkButton
                    href={`/customers/${customer.id}?tab=branches`}
                    variant="outline"
                    size="sm"
                  >
                    Check {account.branches.filter((b) => !b.verified).length}{" "}
                    unverified branches
                  </LinkButton>
                ) : null}
                {account.items.length ? null : (
                  <LinkButton
                    href={`/customers/${customer.id}?tab=catalogue`}
                    variant="outline"
                    size="sm"
                  >
                    Add their agreed prices
                  </LinkButton>
                )}
                {waiting ? (
                  <LinkButton
                    href={`/customers/${customer.id}?tab=deliveries`}
                    variant="outline"
                    size="sm"
                  >
                    Plan a delivery run
                  </LinkButton>
                ) : null}
                <span className="ml-auto">
                  <KeyAccountSwitch
                    customerId={customer.id}
                    on
                    name={customer.name}
                  />
                </span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-4">
              <Panel title="Details">
                <Facts
                  items={[
                    { label: "Phone", value: customer.phone },
                    { label: "Email", value: customer.email },
                    {
                      label: "Credit",
                      value: credit,
                      hint:
                        customer.creditDays === null &&
                        customer.type === "wholesale"
                          ? "Shop default"
                          : undefined,
                    },
                    {
                      label: "TRN",
                      value: customer.trn ? (
                        <span className="tabular">{customer.trn}</span>
                      ) : null,
                    },
                    { label: "Address", value: customer.address },
                    {
                      label: "Notes",
                      value: customer.notes ? (
                        <span className="whitespace-pre-line">
                          {customer.notes}
                        </span>
                      ) : null,
                    },
                  ]}
                />
                {!customer.phone &&
                !customer.email &&
                !customer.address &&
                !customer.notes ? (
                  <p className="text-sm text-ink-muted">
                    Only the name is saved. Add a phone number so you can call
                    them from here.
                  </p>
                ) : null}
              </Panel>
              <Measurements
                customerId={customer.id}
                fields={fields.map((f) => f.name)}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  fields: t.fields,
                }))}
                sets={sets.map((m) => ({
                  id: m.id,
                  label: m.label,
                  values: m.values,
                  notes: m.notes,
                  createdAt: m.createdAt.toISOString(),
                  templateId: m.templateId,
                  templateName: m.templateName,
                }))}
              />
              {!account &&
              (customer.type === "wholesale" || branches.length) ? (
                <Branches customerId={customer.id} branches={branches} />
              ) : null}
            </div>
            <div className="flex flex-col gap-4">
              <Panel title="Money">
                {money && money.owed > 0 ? (
                  <>
                    <p className="text-[13px] font-semibold text-ink-muted">
                      They owe you
                    </p>
                    <p className="tabular font-display text-[2rem] leading-tight font-medium">
                      {formatFils(money.owed)}
                    </p>
                    <p className="mt-1 text-[14px]">
                      {late > 0 ? (
                        <span className="font-semibold text-brand">
                          {formatFils(late)} overdue.{" "}
                        </span>
                      ) : (
                        <span className="text-[#4d7a12]">
                          Nothing overdue.{" "}
                        </span>
                      )}
                      {money.oldestDue ? (
                        <span className="text-ink-muted">
                          Oldest due {formatISODate(money.oldestDue, true)}.
                        </span>
                      ) : null}
                    </p>
                    <AgingBar
                      notDue={money.notDue}
                      d1_30={money.d1_30}
                      d31_60={money.d31_60}
                      d61={money.d61}
                      className="mt-3"
                    />
                  </>
                ) : (
                  <p className="text-[15px] text-ink-muted">
                    They owe you nothing right now.
                  </p>
                )}
                {money && money.credit > 0 ? (
                  <p className="tabular mt-2 text-[14px] text-[#4d7a12]">
                    {formatFils(money.credit)} paid in advance or on account.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton
                    href={`/money/payments/new?customer=${customer.id}`}
                    size="sm"
                    variant={late > 0 ? "default" : "outline"}
                  >
                    Record payment
                  </LinkButton>
                  <LinkButton
                    href={`/money/statement/${customer.id}`}
                    size="sm"
                    variant="ghost"
                  >
                    Statement
                  </LinkButton>
                </div>
              </Panel>
              <Panel
                title="Orders"
                action={
                  <LinkButton
                    href={`/orders/new?customer=${customer.id}`}
                    variant="outline"
                    size="sm"
                  >
                    <PlusIcon />
                    New order
                  </LinkButton>
                }
              >
                {orders.length ||
                quoteRows.some((q) => q.status !== "accepted") ? (
                  <ul className="flex flex-col divide-y divide-line">
                    {orders.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center gap-2 py-2.5 first:pt-0"
                      >
                        <Link
                          href={`/orders/${o.id}`}
                          className="tabular flex-1 text-[15px] font-semibold hover:underline"
                        >
                          {orderNo(o.number)}
                          <span className="ml-2 text-[12px] font-medium text-ink-muted">
                            {formatISODate(o.orderDate)}
                          </span>
                        </Link>
                        <StageTag stage={o.stage} />
                        <span className="tabular hidden w-24 text-right text-sm sm:inline">
                          {formatFils(o.totalFils, { currency: false })}
                        </span>
                        <LinkButton
                          href={`/orders/new?copy=${o.id}`}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Order ${orderNo(o.number)} again`}
                          title="Order again"
                        >
                          <CopyIcon className="text-ink-muted" />
                        </LinkButton>
                      </li>
                    ))}
                    {quoteRows
                      .filter((q) => q.status !== "accepted")
                      .map((q) => (
                        <li
                          key={q.id}
                          className="flex items-center gap-2 py-2.5"
                        >
                          <Link
                            href={`/orders/quotes/${q.id}`}
                            className="tabular flex-1 text-[15px] font-semibold hover:underline"
                          >
                            {q.number}
                            <span className="ml-2 text-[12px] font-medium text-ink-muted">
                              Quote,{" "}
                              {QUOTE_STATUS_LABEL[q.status].toLowerCase()}
                            </span>
                          </Link>
                          <span className="tabular hidden w-24 text-right text-sm sm:inline">
                            {formatFils(q.totalFils, { currency: false })}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No orders yet. Their first order starts from New order.
                  </p>
                )}
              </Panel>
              <RecentActivity
                entityId={customer.id}
                relatedIds={[
                  ...branches.map((b) => b.id),
                  ...sets.map((m) => m.id),
                ]}
              />
              <div className="flex justify-end">
                <ArchiveButton
                  action={setCustomerArchived}
                  id={customer.id}
                  archived={archived}
                  noun="customer"
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
