import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq, ilike, or, sql, getTableColumns } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { suppliers, type SupplierType } from "@/db/schema";
import { FilterChips, hrefWith } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { ArchivedTag, SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { PurchasesTabs } from "@/components/section-navs";
import { archivedFilter, likeTerm, where } from "@/lib/archive";
import { SUPPLIER_TYPE_LABEL } from "@/lib/labels";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Suppliers" };

type Search = { q?: string; type?: string; archived?: string };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const showArchived = params.archived === "1";
  const type = ["fabric", "outsourcing", "delivery"].includes(params.type ?? "") ? (params.type as SupplierType) : undefined;
  const base = "/purchases/suppliers";

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(suppliers),
        fabricCount: sql<number>`(select count(*)::int from fabrics f where f.supplier_id = suppliers.id and f.deleted_at is null)`,
      })
      .from(suppliers)
      .where(
        where(
          archivedFilter(suppliers.deletedAt, showArchived),
          type && eq(suppliers.type, type),
          q && or(ilike(suppliers.name, likeTerm(q)), ilike(suppliers.phone, likeTerm(q)), ilike(suppliers.contactName, likeTerm(q)), ilike(suppliers.city, likeTerm(q))),
        ),
      )
      .orderBy(asc(suppliers.name))
      .limit(300),
    db.select({ total: count() }).from(suppliers),
  ]);

  return (
    <>
      <PageHeader
        title="Purchases"
        actions={
          total ? (
            <LinkButton href="/purchases/suppliers/new">
              <PlusIcon />
              Add supplier
            </LinkButton>
          ) : null
        }
      />
      <PurchasesTabs />
      {total === 0 ? (
        <EmptyState
          title="No suppliers yet"
          sentence="Add the shops you buy fabric from and the stitching units that sew for you."
          action={
            <LinkButton href="/purchases/suppliers/new">
              <PlusIcon />
              Add your first supplier
            </LinkButton>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by name, contact, phone or city" />
            <FilterChips
              base={base}
              params={params}
              name="type"
              options={[
                { label: "All" },
                { value: "fabric", label: "Fabric suppliers" },
                { value: "outsourcing", label: "Stitching units" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/${s.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[16px] font-semibold">{s.name}</p>
                        {s.deletedAt ? <ArchivedTag /> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                        {[s.city, s.contactName, s.phone, s.fabricCount ? `${s.fabricCount} fabrics` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <SoftTag className="hidden sm:inline-flex">{SUPPLIER_TYPE_LABEL[s.type]}</SoftTag>
                    <ChevronRightIcon className="size-5 shrink-0 text-ink-muted/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              sentence={showArchived ? "No archived suppliers match." : `No supplier matches${q ? ` "${q}"` : " this filter"}.`}
              action={
                <LinkButton href="/purchases/suppliers/new">
                  <PlusIcon />
                  Add supplier
                </LinkButton>
              }
            />
          )}
          <p className="mt-6 text-center text-sm">
            <Link href={hrefWith(base, params, { archived: showArchived ? undefined : "1" })} className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              {showArchived ? "Show active suppliers" : "Show archived suppliers"}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
