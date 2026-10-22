import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDaysISO } from "./dates";

export type CustomerHealth = {
  customerId: string;
  name: string;
  tier: "vip" | "regular" | "new";
  lastOrder: string | null;
  yearFils: number;
  avgDaysToPay: number | null;
};

/**
 * Idea 20. Per customer: last confirmed order, value ordered this year, and average days
 * from invoice to the payment that cleared it.
 */
export async function customerHealth(today: string, customerId?: string): Promise<CustomerHealth[]> {
  const year = today.slice(0, 4);
  const res = await db.execute<{ customer_id: string; name: string; tier: CustomerHealth["tier"]; last_order: string | null; year_fils: number; avg_days: number | null }>(sql`
    with orders as (
      select customer_id, max(order_date) last_order,
        coalesce(sum(total_fils) filter (where to_char(order_date, 'YYYY') = ${year}), 0)::int year_fils
      from sales_orders where stage not in ('draft', 'cancelled') group by customer_id
    ),
    cleared as (
      select i.customer_id, i.invoice_date, max(p.payment_date) paid_on
      from invoices i
      join payment_allocations a on a.invoice_id = i.id
      join payments p on p.id = a.payment_id
      where i.kind = 'tax_invoice'
      group by i.id, i.customer_id, i.invoice_date, i.total_fils
      having sum(a.amount_fils) + coalesce((select sum(c.total_fils) from credit_notes c where c.invoice_id = i.id), 0) >= i.total_fils
    ),
    pay as (
      select customer_id, round(avg(greatest(0, paid_on - invoice_date)))::int avg_days from cleared group by customer_id
    )
    select c.id customer_id, c.name, c.tier, o.last_order::text, coalesce(o.year_fils, 0)::int year_fils, pay.avg_days
    from customers c
    left join orders o on o.customer_id = c.id
    left join pay on pay.customer_id = c.id
    where c.deleted_at is null ${customerId ? sql`and c.id = ${customerId}` : sql``}
    order by o.last_order desc nulls last`);
  return res.rows.map((r) => ({ customerId: r.customer_id, name: r.name, tier: r.tier, lastOrder: r.last_order, yearFils: Number(r.year_fils), avgDaysToPay: r.avg_days === null ? null : Number(r.avg_days) }));
}

/** Customers who ordered before but not in the last 90 days. */
export async function quietCustomers(today: string) {
  const cutoff = addDaysISO(today, -90);
  return (await customerHealth(today)).filter((c) => c.lastOrder && c.lastOrder < cutoff);
}
