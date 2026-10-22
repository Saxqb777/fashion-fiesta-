import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, paymentAllocations, suppliers } from "@/db/schema";
import { AddCustomerOpeningForm, OpeningCashForm, RemoveOpeningButton, SupplierOpeningForm } from "@/components/forms/opening-forms";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { getSettings } from "@/lib/settings";

/**
 * Where the shop stands on day one: cash in the drawer, who owes the shop, who the shop owes.
 * Shared by the setup wizard and Settings.
 */
export async function OpeningBalances() {
  const today = todayISO();
  const [s, owed, customerList, supplierList, allocated] = await Promise.all([
    getSettings(),
    db
      .select({ id: invoices.id, amount: invoices.totalFils, since: invoices.invoiceDate, name: customers.name, customerId: customers.id })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(invoices.kind, "opening_balance"))
      .orderBy(asc(customers.name)),
    db.select({ id: customers.id, name: customers.name }).from(customers).where(isNull(customers.deletedAt)).orderBy(asc(customers.name)),
    db.select().from(suppliers).where(isNull(suppliers.deletedAt)).orderBy(asc(suppliers.name)),
    db.selectDistinct({ id: paymentAllocations.invoiceId }).from(paymentAllocations).innerJoin(invoices, and(eq(invoices.id, paymentAllocations.invoiceId), eq(invoices.kind, "opening_balance"))),
  ]);
  const owing = supplierList.filter((x) => x.openingBalanceFils > 0);
  const paidSome = new Set(allocated.map((a) => a.id));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-sans text-base font-semibold">Cash in hand</h2>
        <p className="mb-4 text-[14px] text-ink-muted">Count the drawer on the day you start. The cash book starts from this number.</p>
        <OpeningCashForm cashFils={s.openingCashFils} date={s.openingDate} today={today} />
      </section>

      <section className="border-t border-line pt-6">
        <h2 className="font-sans text-base font-semibold">Who owes you now</h2>
        <p className="mb-4 text-[14px] text-ink-muted">One line per customer with what they owed before you started. It shows in Who owes you and on their statement. Payments can be set against it.</p>
        {owed.length ? (
          <ul className="mb-4 flex flex-col divide-y divide-line rounded-[14px] border border-line">
            {owed.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/customers/${o.customerId}`} className="text-[15px] font-semibold hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-[13px] text-ink-muted">Since {formatISODate(o.since, true)}</p>
                </div>
                <p className="tabular text-[15px] font-semibold">{formatFils(o.amount)}</p>
                {paidSome.has(o.id) ? <span className="text-[12px] text-ink-muted">Payments set against it</span> : <RemoveOpeningButton id={o.id} />}
              </li>
            ))}
          </ul>
        ) : null}
        {customerList.length ? (
          <AddCustomerOpeningForm customers={customerList} today={today} />
        ) : (
          <p className="text-[14px]">
            Add your customers first.{" "}
            <Link href="/customers/new" className="font-semibold text-brand hover:underline">
              Add a customer
            </Link>
          </p>
        )}
      </section>

      <section className="border-t border-line pt-6">
        <h2 className="font-sans text-base font-semibold">Who you owe now</h2>
        <p className="mb-4 text-[14px] text-ink-muted">What you owed each supplier before you started. Supplier bills and payments come in Purchases.</p>
        {owing.length ? (
          <ul className="mb-4 flex flex-col divide-y divide-line rounded-[14px] border border-line">
            {owing.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{o.name}</p>
                  {o.openingBalanceDate ? <p className="text-[13px] text-ink-muted">Since {formatISODate(o.openingBalanceDate, true)}</p> : null}
                </div>
                <p className="tabular text-[15px] font-semibold">{formatFils(o.openingBalanceFils)}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {supplierList.length ? (
          <SupplierOpeningForm suppliers={supplierList.map((x) => ({ id: x.id, name: x.name }))} today={today} />
        ) : (
          <p className="text-[14px]">
            Add your suppliers first.{" "}
            <Link href="/purchases/suppliers/new" className="font-semibold text-brand hover:underline">
              Add a supplier
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
