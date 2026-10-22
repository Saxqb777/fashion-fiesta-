import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesOrders } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { TierTag } from "@/components/data/tags";
import { PaymentForm } from "@/components/money/payment-form";
import { PickCustomer } from "@/components/money/pick-customer";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { invoiceFigures, openInvoicesFor } from "@/lib/ledger";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Record payment" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/.test(v));

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ customer?: string; order?: string; deposit?: string; invoice?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const order = isId(params.order) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, params.order!) }) : undefined;
  const customerId = order?.customerId ?? (isId(params.customer) ? params.customer! : "");
  const customer = customerId ? await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), isNull(customers.deletedAt)) }) : undefined;

  if (!customer) {
    return (
      <>
        <BackLink href="/money/payments" label="Payments" />
        <PageHeader title="Record payment" description="Who paid you?" />
        <div className="max-w-xl">
          <PickCustomer />
        </div>
      </>
    );
  }

  const deposit = Boolean(order && params.deposit === "1");
  const open = deposit ? [] : await openInvoicesFor(customer.id);
  const focus = isId(params.invoice) ? params.invoice! : null;
  const defaultAmount = focus ? ((await invoiceFigures([focus])).get(focus)?.balanceFils ?? 0) : 0;

  return (
    <>
      <BackLink href={order ? `/orders/${order.id}` : `/customers/${customer.id}`} label={order?.number ?? customer.name} />
      <PageHeader
        eyebrow={deposit ? `Deposit on ${order?.number}` : "Record payment"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            {customer.tier === "vip" ? <TierTag tier="vip" /> : null}
          </span>
        }
      />
      <PaymentForm
        customerId={customer.id}
        open={open.map((o) => ({ id: o.id, label: o.kind === "opening_balance" ? "Opening balance" : (o.number ?? "Invoice"), dueDate: o.dueDate, balanceFils: o.balanceFils }))}
        orderId={order?.id ?? null}
        deposit={deposit}
        defaultAmountFils={defaultAmount}
        focusInvoiceId={focus}
        cancelHref={order ? `/orders/${order.id}` : focus ? `/money/invoices/${focus}` : `/customers/${customer.id}`}
        today={todayISO()}
      />
    </>
  );
}
