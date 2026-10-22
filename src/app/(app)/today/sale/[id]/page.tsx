import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import { posSaleLines, posSales, users } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { LinkButton } from "@/components/link-button";
import { Celebrate } from "@/components/money/celebrate";
import { SendDoc } from "@/components/money/send-doc";
import { sendDocProps } from "@/lib/doc-links";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Quick sale" };

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sale = /^[0-9a-f-]{36}$/.test(id) ? await db.query.posSales.findFirst({ where: eq(posSales.id, id) }) : undefined;
  // Tailors see only the sales they made.
  if (!sale || (me.role !== "owner" && sale.soldBy !== me.id)) notFound();
  const [lines, seller, st] = await Promise.all([
    db.select().from(posSaleLines).where(eq(posSaleLines.saleId, id)).orderBy(asc(posSaleLines.sort)),
    db.query.users.findFirst({ where: eq(users.id, sale.soldBy), columns: { name: true } }),
    getSettings(),
  ]);
  const send = await sendDocProps("pos", sale.id, {
    phone: sale.customerPhone,
    filename: sale.number,
    message: `${st.tradeName}: thank you for your purchase. Invoice ${sale.number}, ${formatFils(sale.totalFils)}.`,
  });
  return (
    <div className="mx-auto max-w-xl">
      <Celebrate />
      <BackLink href={me.role === "owner" ? "/money/sales" : "/today"} label={me.role === "owner" ? "Quick sales" : "Today"} />
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <p className="tabular text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          {sale.number} · {formatISODate(sale.saleDate, true)}
        </p>
        <p className="tabular mt-3 font-display text-[3rem] leading-none">{formatFils(sale.totalFils)}</p>
        <p className="mt-2 text-[15px] font-semibold text-[#4d7a12]">Paid by {sale.method === "card" ? "card" : "cash"}</p>
        <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
          {lines.map((l) => (
            <li key={l.id} className="tabular flex items-baseline gap-3 py-2 text-[15px]">
              <span className="flex-1">
                {l.qty} × {l.description}
              </span>
              <span>{formatFils(l.netFils + l.vatFils, { currency: false })}</span>
            </li>
          ))}
        </ul>
        <p className="tabular mt-2 text-[13px] text-ink-muted">
          VAT {formatFils(sale.vatFils)} included. Sold by {seller?.name ?? "the shop"}
          {sale.customerName ? ` to ${sale.customerName}` : ""}.
        </p>
        <div className="mt-5">
          <SendDoc {...send} size="default" />
        </div>
      </section>
      <LinkButton href="/today/sale" size="lg" variant="outline" className="mt-4 h-14 w-full">
        <PlusIcon />
        Next sale
      </LinkButton>
    </div>
  );
}
