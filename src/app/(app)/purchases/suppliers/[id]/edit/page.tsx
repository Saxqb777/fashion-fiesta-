import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { SupplierForm } from "@/components/forms/supplier-form";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const supplier = /^[0-9a-f-]{36}$/.test(id) ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) }) : undefined;
  if (!supplier) notFound();
  return (
    <>
      <BackLink href={`/purchases/suppliers/${id}`} label={supplier.name} />
      <PageHeader title={`Edit ${supplier.name}`} />
      <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <SupplierForm supplier={supplier} />
      </div>
    </>
  );
}
