import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { productCategories, products } from "@/db/schema";
import { FilterChips, hrefWith } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { PageHeader } from "@/components/page-header";
import { OrdersTabs } from "@/components/section-navs";
import { archivedFilter, likeTerm, where } from "@/lib/archive";
import { activeCategories } from "@/lib/lookups";
import { requireOwner } from "@/lib/session";
import { ProductList } from "./product-list";

export const metadata: Metadata = { title: "Products" };

type Search = { q?: string; cat?: string; archived?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const showArchived = params.archived === "1";
  const base = "/orders/products";
  const categories = await activeCategories();
  const cat = categories.some((c) => c.id === params.cat) ? params.cat : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ p: products, categoryName: productCategories.name })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(
        where(
          archivedFilter(products.deletedAt, showArchived),
          cat && eq(products.categoryId, cat),
          q && or(ilike(products.name, likeTerm(q)), ilike(productCategories.name, likeTerm(q))),
        ),
      )
      .orderBy(asc(productCategories.name), asc(products.name))
      .limit(500),
    db.select({ total: count() }).from(products),
  ]);

  return (
    <>
      <PageHeader title="Orders" />
      <OrdersTabs />
      {total > 0 ? (
        <div className="mb-5 flex flex-col gap-3">
          <SearchBox placeholder="Search products" />
          {categories.length ? (
            <FilterChips base={base} params={params} name="cat" options={[{ label: "All" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          ) : null}
        </div>
      ) : null}
      <ProductList
        rows={rows.map((r) => ({ ...r.p, categoryName: r.categoryName }))}
        categories={categories}
        isEmpty={total === 0}
        filteredText={showArchived ? "No archived products match." : `No product matches${q ? ` "${q}"` : " this category"}.`}
      />
      {total > 0 ? (
        <p className="mt-6 text-center text-sm">
          <Link href={hrefWith(base, params, { archived: showArchived ? undefined : "1" })} className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            {showArchived ? "Show active products" : "Show archived products"}
          </Link>
        </p>
      ) : null}
    </>
  );
}
