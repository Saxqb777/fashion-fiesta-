import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PencilIcon, PhoneIcon, PlusIcon } from "lucide-react";
import { setSupplierArchived } from "@/actions/suppliers";
import { db } from "@/db";
import { fabrics, purchaseOrders, supplierPayments, suppliers } from "@/db/schema";
import { AgingBar } from "@/components/money/bits";
import { PoStageTag } from "@/components/purchases/bits";
import { METHOD_LABEL } from "@/lib/ledger";
import { agingBySupplier, poSummaries } from "@/lib/payables";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { ArchiveButton } from "@/components/data/archive-button";
import { formatFils } from "@/lib/money";
import { formatISODate } from "@/lib/dates";
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
  const [[money], pos, paid] = await Promise.all([
    agingBySupplier(id),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.supplierId, id)).orderBy(desc(purchaseOrders.createdAt)).limit(6),
    db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, id)).orderBy(desc(supplierPayments.paymentDate)).limit(5),
  ]);
  const poStages = await poSummaries(pos.map((p) => p.id));
  const late = money ? money.d1_30 + money.d31_60 + money.d61 : 0;

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
          <Panel title="Money">
            {money && money.owed > 0 ? (
              <>
                <p className="text-[13px] font-semibold text-ink-muted">You owe them</p>
                <p className="tabular font-display text-[2rem] leading-tight font-medium">{formatFils(money.owed)}</p>
                <p className="mt-1 text-[14px]">
                  {late > 0 ? <span className="font-semibold text-brand">{formatFils(late)} late. </span> : <span className="text-[#4d7a12]">Nothing late. </span>}
                  {money.oldestDue ? <span className="text-ink-muted">Oldest due {formatISODate(money.oldestDue, true)}.</span> : null}
                </p>
                <AgingBar notDue={money.notDue} d1_30={money.d1_30} d31_60={money.d31_60} d61={money.d61} className="mt-3" />
              </>
            ) : (
              <p className="text-[15px] text-ink-muted">You owe them nothing right now.</p>
            )}
            {money && money.advance > 0 ? <p className="tabular mt-2 text-[14px] text-[#4d7a12]">{formatFils(money.advance)} paid in advance.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href={`/purchases/payments/new?supplier=${supplier.id}`} size="sm" variant={late > 0 ? "default" : "outline"}>
                Pay
              </LinkButton>
              <LinkButton href={`/purchases/bills/new?supplier=${supplier.id}`} size="sm" variant="ghost">
                Enter a bill
              </LinkButton>
            </div>
            {paid.length ? (
              <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
                {paid.map((p) => (
                  <li key={p.id} className="tabular flex justify-between gap-3">
                    <span className="text-ink-muted">
                      Paid {formatISODate(p.paymentDate, true)} · {METHOD_LABEL[p.method]}
                    </span>
                    <span className="font-semibold">{formatFils(p.amountFils)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <Panel
            title="Purchase orders"
            action={
              <LinkButton href={`/purchases/orders/new?supplier=${supplier.id}`} variant="outline" size="sm">
                <PlusIcon />
                New PO
              </LinkButton>
            }
          >
            {pos.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {pos.map((p) => (
                  <li key={p.id}>
                    <Link href={`/purchases/orders/${p.id}`} className="flex items-center gap-2 py-2.5">
                      <span className="tabular text-[14px] font-semibold">{p.number ?? "Draft"}</span>
                      <PoStageTag stage={poStages.get(p.id)?.stage ?? "draft"} />
                      <span className="tabular ml-auto text-[14px]">{formatFils(p.totalFils)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-muted">No purchase orders to {supplier.name} yet.</p>
            )}
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
