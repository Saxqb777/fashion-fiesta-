import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountItems,
  accountStaff,
  customerBranches,
  deliveryNoteLines,
  deliveryNotes,
  deliveryRuns,
  pieceTicks,
  salesOrders,
  soLineAllocations,
  soLines,
  suppliers,
} from "@/db/schema";

import { EMIRATES } from "./emirates";

export { EMIRATES };

/** Matches what people type: "AD", "abu dhabi", "RAK", "UAQ". */
export function matchEmirate(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!v) return null;
  const short: Record<string, string> = { ad: "Abu Dhabi", auh: "Abu Dhabi", dxb: "Dubai", shj: "Sharjah", rak: "Ras Al Khaimah", uaq: "Umm Al Quwain", fuj: "Fujairah", ajm: "Ajman" };
  if (short[v]) return short[v];
  return EMIRATES.find((e) => e.toLowerCase().replace(/[^a-z]/g, "") === v || v.startsWith(e.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5))) ?? null;
}

export { DEFAULT_LABEL_LAYOUT, LABEL_PRESETS } from "./label-layouts";

export type Piece = {
  key: string;
  soLineId: string;
  allocationId: string | null;
  branchId: string | null;
  description: string;
  person: string | null;
  size: string | null;
  /** Piece n of total, within its line part. */
  n: number;
  of: number;
};

/**
 * Every garment of an order, one entry per piece. Lines split per branch give pieces per part;
 * other lines give pieces for the order's own branch. Labels and delivery ticks use the same keys.
 */
export async function orderPieces(orderId: string): Promise<Piece[]> {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order) return [];
  const lines = await db.select().from(soLines).where(eq(soLines.orderId, orderId)).orderBy(asc(soLines.sort));
  const allocs = lines.length
    ? await db
        .select({ a: soLineAllocations, staffName: accountStaff.name })
        .from(soLineAllocations)
        .leftJoin(accountStaff, eq(accountStaff.id, soLineAllocations.staffId))
        .where(inArray(soLineAllocations.soLineId, lines.map((l) => l.id)))
        .orderBy(asc(soLineAllocations.sort))
    : [];
  const out: Piece[] = [];
  for (const l of lines) {
    const parts = allocs.filter((x) => x.a.soLineId === l.id);
    if (parts.length) {
      for (const { a, staffName } of parts) {
        for (let i = 1; i <= a.qty; i++) {
          out.push({ key: `${l.id}:${a.id}:${i}`, soLineId: l.id, allocationId: a.id, branchId: a.branchId, description: l.description, person: a.personName ?? staffName ?? null, size: a.size, n: i, of: a.qty });
        }
      }
    } else {
      for (let i = 1; i <= l.qty; i++) {
        out.push({ key: `${l.id}:-:${i}`, soLineId: l.id, allocationId: null, branchId: order.branchId, description: l.description, person: l.measurementLabel, size: null, n: i, of: l.qty });
      }
    }
  }
  return out;
}

/** Pieces that belong on one delivery note: its branch, its lines, up to the quantities on the note. */
export async function deliveryNotePieces(deliveryNoteId: string) {
  const dn = await db.query.deliveryNotes.findFirst({ where: eq(deliveryNotes.id, deliveryNoteId) });
  if (!dn) return { pieces: [] as Piece[], ticked: new Set<string>() };
  const [all, lines, ticks] = await Promise.all([
    orderPieces(dn.orderId),
    db.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, dn.id)),
    db.select({ key: pieceTicks.pieceKey, dn: pieceTicks.deliveryNoteId }).from(pieceTicks).where(eq(pieceTicks.orderId, dn.orderId)),
  ]);
  const tickedBy = new Map(ticks.map((t) => [t.key, t.dn]));
  const ticked = new Set(ticks.filter((t) => t.dn === dn.id).map((t) => t.key));
  const pieces: Piece[] = [];
  const taken = new Set<string>();
  for (const l of lines) {
    const candidates = all.filter((p) => p.soLineId === l.soLineId && !taken.has(p.key) && (l.allocationId ? p.allocationId === l.allocationId : true));
    // This note's own pieces first, then ones not yet ticked anywhere. Pieces ticked on another note never move here.
    const sorted = [...candidates.filter((p) => tickedBy.get(p.key) === dn.id), ...candidates.filter((p) => !tickedBy.has(p.key))];
    for (const p of sorted.slice(0, l.qty)) {
      taken.add(p.key);
      pieces.push(p);
    }
  }
  return { pieces, ticked };
}

/** What still has to go to each branch: per line part, the ordered quantity minus what is on any delivery note. */
export async function pendingByBranch(orderIds: string[]) {
  if (!orderIds.length) return [];
  const [orders, lines, allocs, onNotes] = await Promise.all([
    db.select({ id: salesOrders.id, branchId: salesOrders.branchId, number: salesOrders.number }).from(salesOrders).where(inArray(salesOrders.id, orderIds)),
    db.select().from(soLines).where(inArray(soLines.orderId, orderIds)).orderBy(asc(soLines.sort)),
    db.select().from(soLineAllocations).innerJoin(soLines, eq(soLines.id, soLineAllocations.soLineId)).where(inArray(soLines.orderId, orderIds)),
    db
      .select({ soLineId: deliveryNoteLines.soLineId, allocationId: deliveryNoteLines.allocationId, n: sql<number>`sum(${deliveryNoteLines.qty})::int` })
      .from(deliveryNoteLines)
      .innerJoin(soLines, eq(soLines.id, deliveryNoteLines.soLineId))
      .where(inArray(soLines.orderId, orderIds))
      .groupBy(deliveryNoteLines.soLineId, deliveryNoteLines.allocationId),
  ]);
  const rows: { orderId: string; branchId: string | null; soLineId: string; allocationId: string | null; description: string; left: number }[] = [];
  for (const l of lines) {
    const parts = allocs.filter((a) => a.so_line_allocations.soLineId === l.id).map((a) => a.so_line_allocations);
    const order = orders.find((o) => o.id === l.orderId)!;
    if (parts.length) {
      // Pieces sent before the line was split count against the whole line, taken from the first parts.
      let loose = onNotes.filter((n) => n.soLineId === l.id && !n.allocationId).reduce((s, n) => s + n.n, 0);
      for (const a of parts) {
        const sent = onNotes.find((n) => n.allocationId === a.id)?.n ?? 0;
        let left = Math.max(0, a.qty - sent);
        const take = Math.min(left, loose);
        left -= take;
        loose -= take;
        if (left > 0) rows.push({ orderId: l.orderId, branchId: a.branchId, soLineId: l.id, allocationId: a.id, description: l.description, left });
      }
    } else {
      const sent = onNotes.filter((n) => n.soLineId === l.id).reduce((s, n) => s + n.n, 0);
      if (l.qty - sent > 0) rows.push({ orderId: l.orderId, branchId: order.branchId, soLineId: l.id, allocationId: null, description: l.description, left: l.qty - sent });
    }
  }
  return rows;
}

/** Everything a key account page needs, in one go. */
export async function keyAccountData(customerId: string) {
  const [branches, staff, items, runs, deliveryCompanies, seasons] = await Promise.all([
    db
      .select()
      .from(customerBranches)
      .where(and(eq(customerBranches.customerId, customerId), isNull(customerBranches.deletedAt)))
      .orderBy(asc(customerBranches.emirate), asc(customerBranches.name)),
    db
      .select()
      .from(accountStaff)
      .where(and(eq(accountStaff.customerId, customerId), isNull(accountStaff.deletedAt)))
      .orderBy(asc(accountStaff.name)),
    db
      .select()
      .from(accountItems)
      .where(and(eq(accountItems.customerId, customerId), isNull(accountItems.deletedAt)))
      .orderBy(asc(accountItems.sortOrder), asc(accountItems.name)),
    db.select().from(deliveryRuns).where(eq(deliveryRuns.customerId, customerId)).orderBy(sql`${deliveryRuns.runDate} desc`, sql`${deliveryRuns.createdAt} desc`),
    db
      .select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone })
      .from(suppliers)
      .where(and(eq(suppliers.type, "delivery"), isNull(suppliers.deletedAt)))
      .orderBy(asc(suppliers.name)),
    customerSeasons(customerId),
  ]);
  return { branches, staff, items, runs, deliveryCompanies, seasons };
}

/** Seasons used before, newest first. Feeds the autocomplete. */
export async function customerSeasons(customerId?: string) {
  const rows = await db
    .select({ season: salesOrders.season, last: sql<string>`max(${salesOrders.createdAt})` })
    .from(salesOrders)
    .where(and(sql`${salesOrders.season} is not null`, customerId ? eq(salesOrders.customerId, customerId) : undefined))
    .groupBy(salesOrders.season)
    .orderBy(sql`max(${salesOrders.createdAt}) desc`)
    .limit(30);
  return rows.map((r) => r.season!).filter(Boolean);
}
