import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq, ilike, or } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import { fabrics, suppliers } from "@/db/schema";
import { FabricCard } from "@/components/data/fabric-card";
import { hrefWith } from "@/components/data/filter-chips";
import { Flash } from "@/components/data/flash";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { PurchasesTabs } from "@/components/section-navs";
import { archivedFilter, likeTerm, where } from "@/lib/archive";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Fabrics" };

type Search = { q?: string; archived?: string };

export default async function FabricsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const showArchived = params.archived === "1";
  const base = "/purchases/fabrics";

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ f: fabrics, supplierName: suppliers.name })
      .from(fabrics)
      .leftJoin(suppliers, eq(fabrics.supplierId, suppliers.id))
      .where(
        where(
          archivedFilter(fabrics.deletedAt, showArchived),
          q &&
            or(
              ilike(fabrics.name, likeTerm(q)),
              ilike(fabrics.colour, likeTerm(q)),
              ilike(fabrics.code, likeTerm(q)),
              ilike(fabrics.shelfLocation, likeTerm(q)),
              ilike(suppliers.name, likeTerm(q)),
            ),
        ),
      )
      .orderBy(asc(fabrics.name))
      .limit(300),
    db.select({ total: count() }).from(fabrics),
  ]);

  return (
    <>
      <Flash added="Fabric added." saved="Changes saved." />
      <PageHeader
        title="Purchases"
        actions={
          total ? (
            <LinkButton href="/purchases/fabrics/new">
              <PlusIcon />
              Add fabric
            </LinkButton>
          ) : null
        }
      />
      <PurchasesTabs />
      {total === 0 ? (
        <EmptyState
          title="No fabrics yet"
          sentence="Photograph each roll you keep, note its colour and where it sits on the shelf, so anyone can find it."
          action={
            <LinkButton href="/purchases/fabrics/new">
              <PlusIcon />
              Add your first fabric
            </LinkButton>
          }
        />
      ) : (
        <>
          <SearchBox placeholder="Search by name, colour, code, shelf or supplier" className="mb-5" />
          {rows.length ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {rows.map(({ f, supplierName }) => (
                <FabricCard key={f.id} f={f} supplierName={supplierName} />
              ))}
            </ul>
          ) : (
            <EmptyState
              sentence={showArchived ? "No archived fabrics match." : `No fabric matches${q ? ` "${q}"` : ""}.`}
              action={
                <LinkButton href="/purchases/fabrics/new">
                  <PlusIcon />
                  Add fabric
                </LinkButton>
              }
            />
          )}
          <p className="mt-6 text-center text-sm">
            <Link href={hrefWith(base, params, { archived: showArchived ? undefined : "1" })} className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              {showArchived ? "Show active fabrics" : "Show archived fabrics"}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
