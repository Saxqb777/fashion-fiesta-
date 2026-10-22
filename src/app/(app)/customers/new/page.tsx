import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { CustomerForm } from "@/components/forms/customer-form";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireOwner();
  const settings = await getSettings();
  return (
    <>
      <BackLink href="/customers" label="Customers" />
      <PageHeader title="Add a customer" />
      <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <CustomerForm defaultCreditDays={settings.defaultCreditDays} />
      </div>
    </>
  );
}
