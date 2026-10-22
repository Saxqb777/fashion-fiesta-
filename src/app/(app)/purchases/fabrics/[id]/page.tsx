import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { setFabricArchived } from "@/actions/catalog";
import { db } from "@/db";
import { fabrics } from "@/db/schema";
import { ArchiveButton } from "@/components/data/archive-button";
import { BackLink } from "@/components/data/detail";
import { RecentActivity } from "@/components/data/recent-activity";
import { ArchivedTag } from "@/components/data/tags";
import { FabricForm } from "@/components/forms/fabric-form";
import { PageHeader } from "@/components/page-header";
import { fabricSuppliers } from "@/lib/lookups";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Fabric" };

export default async function FabricPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const fabric = /^[0-9a-f-]{36}$/.test(id) ? await db.query.fabrics.findFirst({ where: eq(fabrics.id, id) }) : undefined;
  if (!fabric) notFound();
  const suppliers = await fabricSuppliers();
  const current = fabric.supplierId && !suppliers.some((s) => s.id === fabric.supplierId);
  const options = current ? [...suppliers, { id: fabric.supplierId!, name: "Archived supplier" }] : suppliers;
  return (
    <>
      <BackLink href="/purchases/fabrics" label="Fabrics" />
      <PageHeader title={fabric.name} eyebrow={fabric.deletedAt ? <ArchivedTag /> : fabric.colour ?? undefined} />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
          <FabricForm fabric={fabric} suppliers={options} />
        </div>
        <div className="flex flex-col gap-4">
          <RecentActivity entityId={fabric.id} />
          <div className="flex justify-end">
            <ArchiveButton action={setFabricArchived} id={fabric.id} archived={Boolean(fabric.deletedAt)} noun="fabric" />
          </div>
        </div>
      </div>
    </>
  );
}
