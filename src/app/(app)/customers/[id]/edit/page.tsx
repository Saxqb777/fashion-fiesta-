import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { CustomerForm } from "@/components/forms/customer-form";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const customer = /^[0-9a-f-]{36}$/.test(id) ? await db.query.customers.findFirst({ where: eq(customers.id, id) }) : undefined;
  if (!customer) notFound();
  const settings = await getSettings();
  return (
    <>
      <BackLink href={`/customers/${id}`} label={customer.name} />
      <PageHeader title={`Edit ${customer.name}`} />
      <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <CustomerForm customer={customer} defaultCreditDays={settings.defaultCreditDays} />
      </div>
    </>
  );
}
