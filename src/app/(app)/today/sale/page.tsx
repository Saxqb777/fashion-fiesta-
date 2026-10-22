import type { Metadata } from "next";
import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { QuickSale } from "@/components/sales/quick-sale";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Quick sale" };

export default async function QuickSalePage() {
  await requireUser();
  const [rows, s] = await Promise.all([
    db.select({ id: products.id, name: products.name, priceFils: products.priceFils }).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.name)),
    getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/today" label="Today" />
      <PageHeader title="Quick sale" description="For the counter. The customer gets a Simplified Tax Invoice on WhatsApp." />
      <QuickSale products={rows} vatRateBp={s.vatRateBp} />
    </div>
  );
}
