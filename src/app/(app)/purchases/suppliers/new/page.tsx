import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { SupplierForm } from "@/components/forms/supplier-form";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Add supplier" };

export default async function NewSupplierPage() {
  await requireOwner();
  return (
    <>
      <BackLink href="/purchases/suppliers" label="Suppliers" />
      <PageHeader title="Add a supplier" />
      <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <SupplierForm />
      </div>
    </>
  );
}
