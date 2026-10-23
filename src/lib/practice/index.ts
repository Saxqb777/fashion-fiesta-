import { and, eq, gt, ilike, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { dbMode, liveDb, practiceAvailable, practiceDb } from "@/db";
import * as t from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { OWNER_MISSIONS, PRACTICE_LOGIN_HINT, TAILOR_MISSIONS, type MissionKey, type MissionsState, type MissionStatus, type MissionView } from "./missions-data";
import { buildSandbox, PRACTICE_PASSWORD, SAMPLE_PO_NUMBER, type PracticeMeta } from "./seed";

export const isPractice = () => dbMode() === "practice";

export async function practiceMeta(): Promise<PracticeMeta | null> {
  const row = await practiceDb().query.practiceMeta.findFirst({ where: eq(t.practiceMeta.key, "meta") }).catch(() => undefined);
  return (row?.value as PracticeMeta | undefined) ?? null;
}

/** Builds the sandbox the first time anyone opens Practice. */
export async function ensureSandbox() {
  if (!practiceAvailable()) throw new Error("Practice is not set up on this server.");
  return (await practiceMeta()) ?? (await buildSandbox());
}

/** An owner added in Live after the last reset still needs a row in the sandbox. */
export async function ensureOwnerInSandbox(userId: string) {
  const p = practiceDb();
  const there = await p.query.users.findFirst({ where: eq(t.users.id, userId) });
  if (there) return;
  const me = await liveDb.query.users.findFirst({ where: eq(t.users.id, userId) });
  if (me) await p.insert(t.users).values({ ...me, passwordHash: "!", practiceMode: false }).onConflictDoNothing();
}

/** The number WhatsApp opens to in Practice: the owner's own phone, or the shop's. */
export async function ownPhone(userId: string) {
  const [me, s] = await Promise.all([liveDb.query.users.findFirst({ where: eq(t.users.id, userId), columns: { phone: true } }), liveDb.query.settings.findFirst({ columns: { phone: true } })]);
  return me?.phone || s?.phone || null;
}

type Ctx = { userId: string; meta: PracticeMeta; since: Date };
const p = () => practiceDb();
const exists = async (q: Promise<unknown[]>) => (await q).length > 0;
const event = (c: Ctx, kind: string, ref?: string) =>
  exists(
    p()
      .select({ id: t.practiceEvents.id })
      .from(t.practiceEvents)
      .where(and(eq(t.practiceEvents.userId, c.userId), eq(t.practiceEvents.kind, kind), ref ? ilike(t.practiceEvents.ref, ref) : undefined))
      .limit(1),
  );

/** Each mission is ticked from what is now in the sandbox, never from a button that says done. */
const CHECKS: Record<MissionKey, (c: Ctx) => Promise<boolean>> = {
  look: (c) => event(c, "attention"),
  walkin: async (c) => {
    if (!c.meta.mehwishId) return false;
    const rows = await p().execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from sales_orders o
        where o.customer_id = ${c.meta.mehwishId} and o.stage <> 'draft' and o.created_at > ${c.since}
          and exists (select 1 from so_lines l where l.order_id = o.id and l.description ilike '%abaya%')
          and exists (select 1 from tasks k where k.order_id = o.id and k.assignee_type = 'tailor')
          and (exists (select 1 from so_lines l where l.order_id = o.id and l.measurements is not null)
            or exists (select 1 from customer_measurements m where m.customer_id = ${c.meta.mehwishId} and m.created_at > ${c.since}))
      ) ok`);
    return Boolean(rows.rows[0]?.ok);
  },
  quote: async (c) => {
    const rows = await p().execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from quotes q join sales_orders o on o.id = q.order_id
        where q.created_at > ${c.since} and q.status = 'accepted' and o.stage <> 'draft'
      ) ok`);
    return Boolean(rows.rows[0]?.ok);
  },
  owes: (c) => event(c, "whatsapp", `statement:${c.meta.pinkMeUpId}%`),
  bigone: async (c) => {
    if (!c.meta.bedashingId) return false;
    const digits = SAMPLE_PO_NUMBER.replace(/\D/g, "").slice(-4);
    const rows = await p()
      .select({ stage: t.salesOrders.stage })
      .from(t.salesOrders)
      .where(and(eq(t.salesOrders.customerId, c.meta.bedashingId), gt(t.salesOrders.createdAt, c.since), ilike(t.salesOrders.customerPoNumber, `%${digits}%`)));
    return rows.length >= 2 && rows.some((r) => r.stage !== "draft");
  },
  approve: async (c) => {
    const task = await p().query.tasks.findFirst({ where: eq(t.tasks.id, c.meta.goodTaskId), columns: { status: true } });
    return task?.status === "approved" && (await event(c, "view", "/workshop/gallery%"));
  },
  fix: async (c) =>
    exists(
      p()
        .select({ id: t.taskReviews.id })
        .from(t.taskReviews)
        .where(and(eq(t.taskReviews.taskId, c.meta.wrongTaskId), eq(t.taskReviews.decision, "rejected"), isNotNull(t.taskReviews.reason), gt(t.taskReviews.createdAt, c.since)))
        .limit(1),
    ),
  deliver: async (c) => {
    if (!c.meta.alDahraOrderId) return false;
    const [dn, inv] = await Promise.all([
      p().select({ id: t.deliveryNotes.id }).from(t.deliveryNotes).where(and(eq(t.deliveryNotes.orderId, c.meta.alDahraOrderId), gt(t.deliveryNotes.createdAt, c.since))).limit(1),
      p().select({ id: t.invoices.id }).from(t.invoices).where(and(eq(t.invoices.orderId, c.meta.alDahraOrderId), gt(t.invoices.createdAt, c.since))),
    ]);
    if (!dn.length || !inv.length) return false;
    const ids = inv.map((i) => i.id);
    const opened = await p()
      .select({ id: t.practiceEvents.id })
      .from(t.practiceEvents)
      .where(and(eq(t.practiceEvents.userId, c.userId), eq(t.practiceEvents.kind, "pdf"), inArray(t.practiceEvents.ref, ids.map((id) => `invoice:${id}`))))
      .limit(1);
    return opened.length > 0;
  },
  paid: async (c) => {
    if (!c.meta.alDahraOrderId) return false;
    const rows = await p().execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from invoices i
        where i.order_id = ${c.meta.alDahraOrderId} and i.created_at > ${c.since}
          and (select coalesce(sum(a.amount_fils), 0) from payment_allocations a where a.invoice_id = i.id) >= i.total_fils
      ) ok`);
    return Boolean(rows.rows[0]?.ok);
  },
  fabric: async (c) => {
    const rows = await p().execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from purchase_orders po
        join suppliers s on s.id = po.supplier_id
        where po.kind = 'fabric' and po.status = 'sent' and po.created_at > ${c.since} and s.type = 'fabric'
          and exists (select 1 from goods_receipts g where g.po_id = po.id and g.created_at > ${c.since})
      ) ok`);
    return Boolean(rows.rows[0]?.ok);
  },
  close: (c) =>
    exists(
      p()
        .select({ id: t.dailyCloses.id })
        .from(t.dailyCloses)
        .where(and(eq(t.dailyCloses.closeDate, todayISO()), eq(t.dailyCloses.differenceFils, 0), gt(t.dailyCloses.updatedAt, c.since)))
        .limit(1),
    ),
  team: (c) =>
    exists(
      p()
        .select({ id: t.salaryPayments.id })
        .from(t.salaryPayments)
        .where(and(gt(t.salaryPayments.createdAt, c.since), gt(t.salaryPayments.advancesDeductedFils, 0)))
        .limit(1),
    ),
  numbers: async (c) => (await event(c, "view", "/reports/profit%")) && (await event(c, "view", "/reports/tax%")) && (await event(c, "excel")),
  progress: async (c) => {
    const id = c.meta.pantsTasks[c.userId];
    if (!id) return false;
    const task = await p().query.tasks.findFirst({ where: eq(t.tasks.id, id), columns: { qtyDone: true, updatedAt: true } });
    return Boolean(task && task.qtyDone >= 18 && task.updatedAt > c.since);
  },
  submit: async (c) =>
    exists(
      p()
        .select({ id: t.taskPhotos.id })
        .from(t.taskPhotos)
        .innerJoin(t.tasks, eq(t.tasks.id, t.taskPhotos.taskId))
        .where(and(eq(t.tasks.tailorId, c.userId), eq(t.taskPhotos.kind, "submission"), gt(t.taskPhotos.createdAt, c.since), ne(t.tasks.status, "assigned")))
        .limit(1),
    ),
  sale: (c) => exists(p().select({ id: t.posSales.id }).from(t.posSales).where(and(eq(t.posSales.soldBy, c.userId), gt(t.posSales.createdAt, c.since))).limit(1)),
};

function startHref(key: MissionKey, m: PracticeMeta, userId: string) {
  switch (key) {
    case "look": return "/today";
    case "quote": return m.quoteCustomerId ? `/orders/quotes/new?customer=${m.quoteCustomerId}` : "/orders/quotes/new";
    case "walkin": return m.mehwishId ? `/orders/new?customer=${m.mehwishId}` : "/orders/new";
    case "owes": return "/money";
    case "bigone": return m.bedashingId ? `/orders/new?customer=${m.bedashingId}` : "/orders/new";
    case "approve": return `/workshop/tasks/${m.goodTaskId}`;
    case "fix": return `/workshop/tasks/${m.wrongTaskId}`;
    case "deliver":
    case "paid": return m.alDahraOrderId ? `/orders/${m.alDahraOrderId}` : "/orders";
    case "fabric": return m.alNoorId ? `/purchases/orders/new?supplier=${m.alNoorId}` : "/purchases/orders/new";
    case "close": return "/money/cash";
    case "team": return "/settings/team";
    case "numbers": return "/reports/profit";
    case "progress":
    case "submit": return m.pantsTasks[userId] ? `/workshop/tasks/${m.pantsTasks[userId]}` : "/workshop";
    case "sale": return "/today/sale";
  }
}

/** The ids the guide scripts point at, for this person. Empty outside Practice. */
export async function guideLinks(userId: string): Promise<Record<string, string>> {
  const m = await practiceMeta();
  if (!m) return {};
  const pick: Record<string, string | null | undefined> = {
    mehwish: m.mehwishId,
    bedashing: m.bedashingId,
    quoteCustomer: m.quoteCustomerId,
    goodTask: m.goodTaskId,
    wrongTask: m.wrongTaskId,
    alDahraOrder: m.alDahraOrderId,
    pinkMeUp: m.pinkMeUpId,
    alNoor: m.alNoorId,
    imran: m.imranId,
    pantsTask: m.pantsTasks[userId],
  };
  return Object.fromEntries(Object.entries(pick).filter((e): e is [string, string] => Boolean(e[1])));
}

/** Where this person is: ticks anything newly done, then returns every mission with its state. */
export async function missionsFor(user: { id: string; role: "owner" | "tailor" }): Promise<MissionsState | null> {
  const meta = await practiceMeta();
  if (!meta) return null;
  const list = user.role === "owner" ? OWNER_MISSIONS : TAILOR_MISSIONS;
  const progress = await p().select().from(t.missionProgress).where(eq(t.missionProgress.userId, user.id));
  const state = new Map(progress.map((r) => [r.missionKey, r.status]));
  const ctx: Ctx = { userId: user.id, meta, since: new Date(meta.seededAt) };
  const fresh: MissionKey[] = [];
  await Promise.all(
    list
      .filter((m) => state.get(m.key) !== "done")
      .map(async (m) => {
        if (await CHECKS[m.key](ctx).catch(() => false)) fresh.push(m.key);
      }),
  );
  if (fresh.length) {
    await p()
      .insert(t.missionProgress)
      .values(fresh.map((k) => ({ userId: user.id, missionKey: k, status: "done" as const })))
      .onConflictDoUpdate({ target: [t.missionProgress.userId, t.missionProgress.missionKey], set: { status: "done", updatedAt: new Date() } });
    for (const k of fresh) state.set(k, "done");
  }
  const missions: MissionView[] = list.map((m) => ({ ...m, status: (state.get(m.key) as MissionStatus | undefined) ?? "open", href: startHref(m.key, meta, user.id) }));
  return {
    role: user.role,
    missions,
    finished: missions.every((m) => m.status !== "open"),
    finishSeen: state.get("finish-seen" as MissionKey) !== undefined,
    login: user.role === "owner" ? { email: PRACTICE_LOGIN_HINT, password: PRACTICE_PASSWORD } : undefined,
  };
}
