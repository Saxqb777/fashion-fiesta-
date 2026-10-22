import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { FabricForm } from "@/components/forms/fabric-form";
import { PageHeader } from "@/components/page-header";
import { fabricSuppliers } from "@/lib/lookups";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Add fabric" };

export default async function NewFabricPage() {
  await requireOwner();
  const suppliers = await fabricSuppliers();
  return (
    <>
      <BackLink href="/purchases/fabrics" label="Fabrics" />
      <PageHeader title="Add a fabric" />
      <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <FabricForm suppliers={suppliers} />
      </div>
    </>
  );
}
