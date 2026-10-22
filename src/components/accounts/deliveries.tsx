import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerBranches, deliveryNotes, salesOrders, type DeliveryRun } from "@/db/schema";
import { pendingByBranch } from "@/lib/accounts";
import { formatISODate, todayISO } from "@/lib/dates";
import { EMIRATES } from "@/lib/emirates";
import { orderNo } from "@/lib/stages";
import { DeliveryNoteRow, PlanRunButton } from "./delivery-client";

export async function Deliveries({
  customerId,
  runs,
  deliveryCompanies,
}: {
  customerId: string;
  runs: DeliveryRun[];
  deliveryCompanies: { id: string; name: string; phone: string | null }[];
}) {
  const [branches, orders] = await Promise.all([
    db.select().from(customerBranches).where(eq(customerBranches.customerId, customerId)),
    db
      .select({ id: salesOrders.id, number: salesOrders.number, orderDate: salesOrders.orderDate, season: salesOrders.season })
      .from(salesOrders)
      .where(and(eq(salesOrders.customerId, customerId), notInArray(salesOrders.stage, ["draft", "cancelled"])))
      .orderBy(asc(salesOrders.orderDate)),
  ]);
  const pending = (await pendingByBranch(orders.map((o) => o.id))).filter((p) => p.branchId);
  const emirateOf = (branchId: string | null) => branches.find((b) => b.id === branchId)?.emirate ?? "Not set";
  const byEmirate = [...EMIRATES, "Not set"]
    .map((e) => {
      const rows = pending.filter((p) => emirateOf(p.branchId) === e);
      return { emirate: e, pieces: rows.reduce((s, r) => s + r.left, 0), branches: new Set(rows.map((r) => r.branchId)).size, orderIds: [...new Set(rows.map((r) => r.orderId))] };
    })
    .filter((g) => g.pieces);
  const waitingOrders = orders
    .map((o) => {
      const rows = pending.filter((p) => p.orderId === o.id);
      return { id: o.id, label: `${orderNo(o.number)}${o.season ? `, ${o.season}` : ""}`, date: o.orderDate, pieces: rows.reduce((s, r) => s + r.left, 0), emirates: [...new Set(rows.map((r) => emirateOf(r.branchId)))] };
    })
    .filter((o) => o.pieces);

  const notes = runs.length
    ? await db
        .select({
          dn: deliveryNotes,
          branchName: customerBranches.name,
          branchPhone: customerBranches.phone,
          orderNumber: salesOrders.number,
          pieces: sql<number>`(select coalesce(sum(l.qty), 0)::int from delivery_note_lines l where l.delivery_note_id = delivery_notes.id)`,
        })
        .from(deliveryNotes)
        .leftJoin(customerBranches, eq(customerBranches.id, deliveryNotes.branchId))
        .innerJoin(salesOrders, eq(salesOrders.id, deliveryNotes.orderId))
        .where(
          inArray(
            deliveryNotes.runId,
            runs.map((r) => r.id),
          ),
        )
        .orderBy(asc(customerBranches.name))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[14px] border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-medium">Waiting to go</h2>
            <p className="text-[14px] text-ink-muted">Pieces on confirmed orders that are not on a delivery note yet, by emirate.</p>
          </div>
          {waitingOrders.length ? <PlanRunButton customerId={customerId} orders={waitingOrders} companies={deliveryCompanies} today={todayISO()} /> : null}
        </div>
        {byEmirate.length ? (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {byEmirate.map((g) => (
              <li key={g.emirate} className="flex flex-wrap items-center gap-3 py-3">
                <p className="min-w-0 flex-1">
                  <span className="text-[15px] font-semibold">{g.emirate}</span>
                  <span className="ml-2 text-[13px] text-ink-muted">
                    {g.branches} {g.branches === 1 ? "branch" : "branches"}
                  </span>
                </p>
                <p className="tabular font-display text-xl">
                  {g.pieces} <span className="font-sans text-[13px] text-ink-muted">pieces</span>
                </p>
                <PlanRunButton customerId={customerId} orders={waitingOrders} companies={deliveryCompanies} today={todayISO()} emirate={g.emirate === "Not set" ? "" : g.emirate} preselect={g.orderIds} compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] text-ink-muted">
            {orders.length ? "Everything confirmed is already on a delivery note." : "When an order is confirmed with lines split per branch, what each branch gets shows here, ready to plan a run."}
          </p>
        )}
      </section>

      {runs.length ? (
        runs.map((run) => {
          const rows = notes.filter((n) => n.dn.runId === run.id);
          const done = rows.filter((r) => r.dn.status === "delivered").length;
          const company = deliveryCompanies.find((c) => c.id === run.deliverySupplierId);
          return (
            <section key={run.id} className="rounded-[14px] border border-line bg-surface">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
                <h3 className="text-lg font-medium">
                  {run.emirate ?? "All emirates"}, {formatISODate(run.runDate, true)}
                </h3>
                <p className="text-[13px] text-ink-muted">{company ? `By ${company.name}` : "No delivery company set"}</p>
                <p className="tabular ml-auto text-[13px] font-semibold">
                  {done} of {rows.length} delivered
                </p>
              </header>
              <ul className="flex flex-col divide-y divide-line">
                {rows.map((r) => (
                  <DeliveryNoteRow
                    key={r.dn.id}
                    note={{
                      id: r.dn.id,
                      number: r.dn.number,
                      branchName: r.branchName ?? "No branch",
                      orderLabel: orderNo(r.orderNumber),
                      pieces: r.pieces,
                      status: r.dn.status,
                      receivedBy: r.dn.receivedBy,
                      deliveredOn: r.dn.status === "delivered" ? r.dn.deliveryDate : null,
                    }}
                    today={todayISO()}
                  />
                ))}
              </ul>
              {run.notes ? <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-muted sm:px-5">{run.notes}</p> : null}
            </section>
          );
        })
      ) : (
        <p className="text-[15px] text-ink-muted">No delivery runs yet. Plan one above and each branch gets its own delivery note to print for the driver.</p>
      )}
    </div>
  );
}
