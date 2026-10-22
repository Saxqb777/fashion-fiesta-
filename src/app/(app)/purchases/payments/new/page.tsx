import type { Metadata } from "next";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { SupplierPaymentForm } from "@/components/purchases/supplier-payment-form";
import { todayISO } from "@/lib/dates";
import { billLabel, openBillsFor } from "@/lib/payables";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Pay a supplier" };

export default async function PaySupplierPage({ searchParams }: { searchParams: Promise<{ supplier?: string; bill?: string }> }) {
  await requireOwner();
  const q = await searchParams;
  const supplier = q.supplier && /^[0-9a-f-]{36}$/.test(q.supplier) ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, q.supplier) }) : undefined;
  if (!supplier) {
    const list = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(isNull(suppliers.deletedAt)).orderBy(asc(suppliers.name));
    return (
      <>
        <BackLink href="/purchases/owe" label="Who you owe" />
        <PageHeader title="Pay a supplier" description="Who did you pay?" />
        {list.length ? (
          <ul className="flex max-w-xl flex-col gap-2">
            {list.map((s) => (
              <li key={s.id}>
                <LinkButton href={`/purchases/payments/new?supplier=${s.id}`} variant="outline" className="w-full justify-start">
                  {s.name}
                </LinkButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState sentence="Add your suppliers first." action={<LinkButton href="/purchases/suppliers/new">Add a supplier</LinkButton>} />
        )}
      </>
    );
  }
  const open = await openBillsFor(supplier.id);
  const focus = q.bill && open.some((o) => o.id === q.bill) ? q.bill : null;
  return (
    <>
      <BackLink href={focus ? `/purchases/bills/${focus}` : `/purchases/suppliers/${supplier.id}`} label={focus ? "Bill" : supplier.name} />
      <PageHeader eyebrow="Pay a supplier" title={supplier.name} />
      <SupplierPaymentForm
        supplierId={supplier.id}
        open={open.map((o) => ({ id: o.id, label: billLabel(o), dueDate: o.dueDate, balanceFils: o.balanceFils }))}
        focusBillId={focus}
        cancelHref={focus ? `/purchases/bills/${focus}` : `/purchases/suppliers/${supplier.id}`}
        today={todayISO()}
      />
    </>
  );
}
