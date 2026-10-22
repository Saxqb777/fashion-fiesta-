import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, ilike, isNull, or, sql, getTableColumns, eq } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { CustomerRow } from "@/components/data/customer-row";
import { FilterChips, hrefWith } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { archivedFilter, likeTerm, where } from "@/lib/archive";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Customers" };

type Search = { q?: string; tier?: string; type?: string; archived?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const showArchived = params.archived === "1";
  const tier = ["vip", "regular", "new"].includes(params.tier ?? "") ? (params.tier as "vip" | "regular" | "new") : undefined;
  const type = ["retail", "wholesale"].includes(params.type ?? "") ? (params.type as "retail" | "wholesale") : undefined;

  const [rows, tierCounts, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(customers),
        branchCount: sql<number>`(select count(*)::int from customer_branches b where b.customer_id = ${customers.id} and b.deleted_at is null)`,
      })
      .from(customers)
      .where(
        where(
          archivedFilter(customers.deletedAt, showArchived),
          tier && eq(customers.tier, tier),
          type && eq(customers.type, type),
          q && or(ilike(customers.name, likeTerm(q)), ilike(customers.phone, likeTerm(q)), ilike(customers.email, likeTerm(q))),
        ),
      )
      .orderBy(sql`case ${customers.tier} when 'vip' then 0 when 'regular' then 1 else 2 end`, asc(customers.name))
      .limit(300),
    db.select({ tier: customers.tier, n: count() }).from(customers).where(isNull(customers.deletedAt)).groupBy(customers.tier),
    db.select({ total: count() }).from(customers),
  ]);
  const tierCount = (t: string) => tierCounts.find((r) => r.tier === t)?.n ?? 0;
  const activeTotal = tierCounts.reduce((s, r) => s + r.n, 0);
  const filtered = Boolean(q || tier || type);
  const base = "/customers";

  return (
    <>
      <PageHeader
        title="Customers"
        description={activeTotal ? `${activeTotal} ${activeTotal === 1 ? "customer" : "customers"}. VIP first.` : undefined}
        actions={
          total ? (
            <LinkButton href="/customers/new">
              <PlusIcon />
              Add customer
            </LinkButton>
          ) : null
        }
      />

      {total === 0 ? (
        <EmptyState
          title="No customers yet"
          sentence="Add the people and businesses you sew for: walk ins, schools, spas. Wholesale customers can have branches and credit days."
          action={
            <LinkButton href="/customers/new">
              <PlusIcon />
              Add your first customer
            </LinkButton>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by name, phone or email" />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <FilterChips
                base={base}
                params={params}
                name="tier"
                options={[
                  { label: "All" },
                  { value: "vip", label: "VIP", count: tierCount("vip") },
                  { value: "regular", label: "Regular", count: tierCount("regular") },
                  { value: "new", label: "New", count: tierCount("new") },
                ]}
              />
              <FilterChips
                base={base}
                params={params}
                name="type"
                options={[
                  { label: "Everyone" },
                  { value: "wholesale", label: "Wholesale" },
                  { value: "retail", label: "Retail" },
                ]}
              />
            </div>
          </div>

          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map(({ branchCount, ...c }) => (
                <CustomerRow key={c.id} c={c} branchCount={branchCount} />
              ))}
            </ul>
          ) : (
            <EmptyState
              sentence={
                showArchived
                  ? "No archived customers match. Archived customers keep their history and can be restored."
                  : filtered
                    ? `No customer matches${q ? ` "${q}"` : " these filters"}. Check the spelling, or add them now.`
                    : "Every customer is archived."
              }
              action={
                showArchived ? (
                  <LinkButton href={hrefWith(base, params, { archived: undefined })} variant="outline">
                    Back to customers
                  </LinkButton>
                ) : (
                  <LinkButton href="/customers/new">
                    <PlusIcon />
                    Add customer
                  </LinkButton>
                )
              }
            />
          )}

          <p className="mt-6 text-center text-sm">
            <Link href={hrefWith(base, params, { archived: showArchived ? undefined : "1" })} className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              {showArchived ? "Show active customers" : "Show archived customers"}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
