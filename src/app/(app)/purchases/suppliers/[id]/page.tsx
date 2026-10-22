import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon, PhoneIcon, PlusIcon } from "lucide-react";
import { setSupplierArchived } from "@/actions/suppliers";
import { db } from "@/db";
import { fabrics, suppliers } from "@/db/schema";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { ArchiveButton } from "@/components/data/archive-button";
import { BackLink, Facts, Panel } from "@/components/data/detail";
import { FabricCard } from "@/components/data/fabric-card";
import { Flash } from "@/components/data/flash";
import { RecentActivity } from "@/components/data/recent-activity";
import { ArchivedTag, SoftTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { SUPPLIER_TYPE_LABEL, telHref } from "@/lib/labels";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const supplier = /^[0-9a-f-]{36}$/.test(id) ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) }) : undefined;
  if (!supplier) notFound();
  const theirFabrics =
    supplier.type === "fabric"
      ? await db.query.fabrics.findMany({ where: and(eq(fabrics.supplierId, id), isNull(fabrics.deletedAt)), orderBy: asc(fabrics.name) })
      : [];
  const archived = Boolean(supplier.deletedAt);

  return (
    <>
      <Flash added={`${supplier.name} added.`} saved="Changes saved." />
      <BackLink href="/purchases/suppliers" label="Suppliers" />
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <SoftTag>{SUPPLIER_TYPE_LABEL[supplier.type]}</SoftTag>
          {archived ? <ArchivedTag /> : null}
        </div>
        <h1 className="mt-3 text-[2rem] leading-[1.05] font-medium md:text-[2.5rem]">{supplier.name}</h1>
        <SwooshStripe className="mt-4 max-w-[72px]" />
        <div className="mt-5 flex flex-wrap gap-2">
          {supplier.phone ? (
            <LinkButton href={telHref(supplier.phone)} variant="outline">
              <PhoneIcon />
              Call {supplier.phone}
            </LinkButton>
          ) : null}
          <LinkButton href={`/purchases/suppliers/${supplier.id}/edit`} variant={supplier.phone ? "ghost" : "outline"}>
            <PencilIcon />
            Edit
          </LinkButton>
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <Facts
              items={[
                { label: "Contact person", value: supplier.contactName },
                { label: "Phone", value: supplier.phone },
                { label: "Email", value: supplier.email },
                { label: "City", value: supplier.city },
                { label: "Payment", value: supplier.paymentDays ? `${supplier.paymentDays} days credit` : "Cash" },
                { label: "TRN", value: supplier.trn ? <span className="tabular">{supplier.trn}</span> : null },
                { label: "Address", value: supplier.address },
                { label: "Notes", value: supplier.notes ? <span className="whitespace-pre-line">{supplier.notes}</span> : null },
              ]}
            />
          </Panel>
          {supplier.type === "fabric" ? (
            <Panel
              title="Fabrics from them"
              action={
                theirFabrics.length ? (
                  <LinkButton href="/purchases/fabrics/new" variant="outline" size="sm">
                    <PlusIcon />
                    Add fabric
                  </LinkButton>
                ) : null
              }
            >
              {theirFabrics.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {theirFabrics.map((f) => (
                    <FabricCard key={f.id} f={f} />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-ink-muted">No fabrics linked yet. Add a fabric and pick {supplier.name} as where you bought it.</p>
                  <LinkButton href="/purchases/fabrics/new" variant="outline">
                    <PlusIcon />
                    Add a fabric
                  </LinkButton>
                </div>
              )}
            </Panel>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Bills and payments">
            <p className="text-sm text-ink-muted">Purchase orders, bills and what you owe them arrive in Phase 4.</p>
          </Panel>
          <RecentActivity entityId={supplier.id} />
          <div className="flex justify-end">
            <ArchiveButton action={setSupplierArchived} id={supplier.id} archived={archived} noun="supplier" />
          </div>
        </div>
      </div>
    </>
  );
}
