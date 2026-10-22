import type { Metadata } from "next";
import { and, count, eq, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesOrders, soLines, tasks } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { WorkshopTabs } from "@/components/section-navs";
import { TaskCard } from "@/components/workshop/task-card";
import { likeTerm } from "@/lib/archive";
import { assigneeNames, editorLookups } from "@/lib/editor-data";
import { requireUser } from "@/lib/session";
import { taskCardColumns, taskOrder } from "@/lib/task-queries";

export const metadata: Metadata = { title: "Workshop" };

type Search = { view?: string; who?: string; q?: string };

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const owner = me.role === "owner";
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const views: Record<string, SQL | undefined> = owner
    ? {
        open: ne(tasks.status, "approved"),
        review: eq(tasks.status, "submitted"),
        questions: and(eq(tasks.openQuestion, true), ne(tasks.status, "approved")),
        declined: eq(tasks.status, "declined"),
        done: eq(tasks.status, "approved"),
      }
    : {
        open: inArray(tasks.status, ["assigned", "in_progress", "rejected", "submitted"]),
        done: eq(tasks.status, "approved"),
      };
  const view = params.view && params.view in views ? params.view : "open";
  const [whoType, whoId] = (params.who ?? "").split(":");
  const who = owner && whoId && /^[0-9a-f-]{36}$/.test(whoId) ? (whoType === "unit" ? eq(tasks.supplierId, whoId) : eq(tasks.tailorId, whoId)) : undefined;
  const mine = owner ? undefined : eq(tasks.tailorId, me.id);

  const [rows, names, viewCounts, lookups] = await Promise.all([
    db
      .select(taskCardColumns)
      .from(tasks)
      .innerJoin(soLines, eq(soLines.id, tasks.soLineId))
      .innerJoin(salesOrders, eq(salesOrders.id, tasks.orderId))
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(
        and(
          views[view],
          mine,
          who,
          q ? or(ilike(customers.name, likeTerm(q)), ilike(salesOrders.number, likeTerm(q)), ilike(soLines.description, likeTerm(q))) : undefined,
        ),
      )
      .orderBy(...taskOrder())
      .limit(view === "done" ? 60 : 300),
    assigneeNames(),
    owner
      ? Promise.all(
          (["review", "questions", "declined"] as const).map(async (k) => {
            const [{ n }] = await db.select({ n: count() }).from(tasks).where(views[k]);
            return [k, n] as const;
          }),
        )
      : Promise.resolve([] as (readonly [string, number])[]),
    owner ? editorLookups() : Promise.resolve(null),
  ]);
  const counts = Object.fromEntries(viewCounts);
  const anyTasks = rows.length > 0 || view !== "open" || Boolean(q) || Boolean(who);

  return (
    <>
      <PageHeader title="Workshop" description={owner ? "Every task across the shop. Overdue first." : "Your work. Overdue first."} />
      <WorkshopTabs owner={owner} />
      {!anyTasks ? (
        <EmptyState
          title={owner ? "No tasks yet" : "Nothing assigned to you"}
          sentence={owner ? "Tasks appear here when you assign order lines to tailors or stitching units." : "When the owner assigns you work, it shows here as a photo card."}
          action={owner ? <LinkButton href="/orders/new">Make an order</LinkButton> : undefined}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            {owner ? <SearchBox placeholder="Search by customer, order or item" /> : null}
            <FilterChips
              base="/workshop"
              params={params}
              name="view"
              options={
                owner
                  ? [
                      { label: "Open" },
                      { value: "review", label: "To review", count: counts.review },
                      { value: "questions", label: "Questions", count: counts.questions },
                      { value: "declined", label: "Declined", count: counts.declined },
                      { value: "done", label: "Approved" },
                    ]
                  : [{ label: "To do" }, { value: "done", label: "Done" }]
              }
            />
            {owner && lookups && lookups.tailors.length + lookups.units.length > 1 ? (
              <FilterChips
                base="/workshop"
                params={params}
                name="who"
                options={[
                  { label: "Everyone" },
                  ...lookups.tailors.map((t) => ({ value: `tailor:${t.id}`, label: t.name })),
                  ...lookups.units.map((u) => ({ value: `unit:${u.id}`, label: u.name })),
                ]}
              />
            ) : null}
          </div>
          {rows.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((t) => (
                <TaskCard key={t.id} t={{ ...t, assigneeName: names.get((t.tailorId ?? t.supplierId)!) }} showAssignee={owner} />
              ))}
            </ul>
          ) : (
            <EmptyState
              sentence={
                view === "review"
                  ? "Nothing waiting for review."
                  : view === "questions"
                    ? "No open questions."
                    : view === "declined"
                      ? "No declined tasks."
                      : view === "done"
                        ? "No approved work yet."
                        : owner
                          ? "Nothing open. All work is approved."
                          : "All done. Nothing waiting for you."
              }
              action={<LinkButton href="/workshop" variant="outline">Show open tasks</LinkButton>}
            />
          )}
        </>
      )}
    </>
  );
}
