import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesOrders, soLines, taskPhotos, tasks } from "@/db/schema";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { WorkshopTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { assigneeNames } from "@/lib/editor-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  const { q: raw } = await searchParams;
  const q = raw?.trim() ?? "";
  const [rows, names] = await Promise.all([
    db
      .select({
        id: taskPhotos.id,
        url: taskPhotos.url,
        taskId: tasks.id,
        qty: tasks.qty,
        tailorId: tasks.tailorId,
        supplierId: tasks.supplierId,
        approvedAt: tasks.approvedAt,
        description: soLines.description,
        customerName: customers.name,
      })
      .from(taskPhotos)
      .innerJoin(tasks, eq(tasks.id, taskPhotos.taskId))
      .innerJoin(soLines, eq(soLines.id, tasks.soLineId))
      .innerJoin(salesOrders, eq(salesOrders.id, tasks.orderId))
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(
        and(
          eq(tasks.status, "approved"),
          eq(taskPhotos.kind, "submission"),
          q ? or(ilike(soLines.description, likeTerm(q)), ilike(customers.name, likeTerm(q))) : undefined,
        ),
      )
      .orderBy(desc(tasks.approvedAt))
      .limit(120),
    assigneeNames(),
  ]);
  return (
    <>
      <PageHeader title="Workshop" description="Approved work. The shop's portfolio." />
      <WorkshopTabs owner={me.role === "owner"} />
      <SearchBox placeholder="Search by item or customer" className="mb-5" />
      {rows.length ? (
        <ul className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {rows.map((r) => (
            <li key={r.id} className="mb-3 break-inside-avoid">
              <Link href={`/workshop/tasks/${r.taskId}`} className="group block overflow-hidden rounded-[14px] border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.description} loading="lazy" className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                <div className="p-3">
                  <p className="truncate text-[14px] font-semibold">{r.description}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {r.customerName} · {r.qty} by {names.get((r.tailorId ?? r.supplierId)!) ?? "the team"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState sentence={q ? `Nothing in the Gallery matches "${q}".` : "Approved work lands here with its photo. Approve the first task in the Workshop to start the Gallery."} />
      )}
    </>
  );
}
