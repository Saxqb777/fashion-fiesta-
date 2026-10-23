import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { liveDb, practiceDb, type Db } from "@/db";
import * as t from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/dates";
import { DEFAULT_SEQUENCES } from "@/lib/defaults";
import { lineAmounts } from "@/lib/lines";
import { lineAmountsCenti } from "@/lib/qty";

/** Practice tailor logins. They exist only in the sandbox. */
export const PRACTICE_TAILORS = [
  { key: "ahmed", name: "Ahmed Raza", email: "ahmed@practice.ff", salary: 220000 },
  { key: "imran", name: "Imran Ali", email: "imran@practice.ff", salary: 200000 },
  { key: "sajid", name: "Sajid Khan", email: "sajid@practice.ff", salary: 180000 },
] as const;
export const PRACTICE_PASSWORD = "practice1";
/** The Customer PO number printed on the sample Bedashing PDF. Mission 4 looks for it. */
export const SAMPLE_PO_NUMBER = "BDB-PO-26-0418";
export const SAMPLE_BRANCHES = ["Khalifa City A", "Al Barsha"];

export type PracticeMeta = {
  seededAt: string;
  goodTaskId: string;
  wrongTaskId: string;
  alDahraOrderId: string | null;
  pinkMeUpId: string | null;
  mehwishId: string | null;
  bedashingId: string | null;
  /** The school for the Quote first mission. Missing in sandboxes built before it existed. */
  quoteCustomerId?: string | null;
  imranId: string;
  alNoorId: string;
  pantsTasks: Record<string, string>;
  tailorIds: Record<string, string>;
};

const VAT = 500;

// Same numbers every reset: the sandbox should feel familiar the second time round.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Stage = "draft" | "confirmed" | "stitching" | "ready" | "delivered" | "invoiced" | "paid";
type Row = Record<string, unknown>;

/**
 * Wipes the sandbox and builds a shop that has been running for three months:
 * the real customers and settings from Live, plus orders, money, stock and a team that exist only here.
 */
export async function buildSandbox(): Promise<PracticeMeta> {
  const p = practiceDb();
  const T = todayISO();
  const ago = (n: number) => addDaysISO(T, -n);
  const now = Date.now();
  // Seeded rows are always older than the moment the sandbox was built, so missions can tell new work apart.
  const at = (iso: string, hour = 9) => new Date(Math.min(Date.parse(`${iso}T${String(hour).padStart(2, "0")}:00:00+04:00`), now - 5 * 60_000));
  const R = rng(20261022);
  const pick = <X,>(xs: readonly X[]) => xs[Math.floor(R() * xs.length)];
  const between = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));

  /* ---------- wipe ---------- */
  const tables = await p.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  if (tables.rows.length) await p.execute(sql.raw(`truncate table ${tables.rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`));

  /* ---------- copied from Live ---------- */
  const [liveSettings, seqs, owners, customers, branches, measures, fields, templates, cats, products, suppliers, fabrics, expCats, staff, items] = await Promise.all([
    liveDb.query.settings.findFirst(),
    liveDb.select().from(t.numberSequences),
    liveDb.select().from(t.users).where(eq(t.users.role, "owner")),
    liveDb.select().from(t.customers),
    liveDb.select().from(t.customerBranches),
    liveDb.select().from(t.customerMeasurements),
    liveDb.select().from(t.measurementFields),
    liveDb.select().from(t.measurementTemplates),
    liveDb.select().from(t.productCategories),
    liveDb.select().from(t.products),
    liveDb.select().from(t.suppliers),
    liveDb.select().from(t.fabrics),
    liveDb.select().from(t.expenseCategories),
    liveDb.select().from(t.accountStaff),
    liveDb.select().from(t.accountItems),
  ]);
  if (!liveSettings) throw new Error("Finish the setup in Live first.");
  const owner = owners.find((o) => o.isActive && !o.deletedAt) ?? owners[0];
  const by = owner?.id ?? null;
  const live = (name: string) => customers.find((c) => c.name.toLowerCase().startsWith(name.toLowerCase()) && !c.deletedAt);

  const rows: Record<string, Row[]> = {};
  const add = (table: string, ...r: Row[]) => (rows[table] ??= []).push(...r);

  /* ---------- team: practice tailors ---------- */
  const hash = await bcrypt.hash(PRACTICE_PASSWORD, 10);
  const tailorIds: Record<string, string> = {};
  for (const tl of PRACTICE_TAILORS) {
    tailorIds[tl.key] = randomUUID();
    add("users", { id: tailorIds[tl.key], name: tl.name, email: tl.email, phone: null, passwordHash: hash, role: "tailor", isActive: true, salaryFils: tl.salary, payDay: 28, createdBy: by, createdAt: at(ago(120)) });
  }
  const tailorKeys = PRACTICE_TAILORS.map((x) => x.key);

  /* ---------- master data the sandbox needs if Live has none yet ---------- */
  const catId = (name: string) => {
    const found = [...cats, ...((rows.product_categories ?? []) as typeof cats)].find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id as string;
    const id = randomUUID();
    const tpl = templates.find((x) => x.name === (name === "Abaya" ? "Abaya" : name === "Uniforms" ? "Shirt or Tunic" : "Shirt or Tunic"));
    add("product_categories", { id, name, measurementTemplateId: tpl?.id ?? null, createdBy: by });
    return id;
  };
  const supplierId = (name: string, type: "fabric" | "outsourcing" | "delivery", extra: Row = {}) => {
    const found = [...suppliers, ...((rows.suppliers ?? []) as typeof suppliers)].find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id as string;
    const id = randomUUID();
    add("suppliers", { id, name, type, paymentDays: 30, createdBy: by, createdAt: at(ago(120)), ...extra });
    return id;
  };
  const alNoor = supplierId("Al Noor Textiles", "fabric", { city: "Dubai", address: "Naif Road, Deira, Dubai", trn: "100234567800003", phone: "04 225 6612", contactName: "Faisal" });
  const deira = supplierId("Deira Fabric House", "fabric", { city: "Dubai", address: "Souk Al Kabeer, Bur Dubai", trn: "100398112400003", phone: "04 353 7781", contactName: "Rakesh" });
  const ajman = supplierId("Ajman Stitching Unit", "outsourcing", { city: "Ajman", address: "Industrial Area 2, Ajman", phone: "06 742 1180", contactName: "Nadeem", paymentDays: 15 });
  supplierId("Swift Courier", "delivery", { city: "Abu Dhabi", phone: "02 555 0192", contactName: "Dispatch" });

  type Fab = { id: string; name: string; cost: number; low: number | null; left: number };
  const fabricList: Fab[] = [];
  const fabric = (name: string, colour: string, cost: number, price: number, shelf: string, supplier: string, low: number | null, left: number) => {
    const found = fabrics.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const id = found?.id ?? randomUUID();
    if (!found) add("fabrics", { id, name, colour, costFils: cost, priceFils: price, shelfLocation: shelf, supplierId: supplier, lowStockCenti: low, createdBy: by, createdAt: at(ago(110)) });
    const f = { id, name: `${name}, ${colour}`, cost: found?.costFils ?? cost, low, left };
    fabricList.push(f);
    return f;
  };
  const nida = fabric("Nida", "Black", 1800, 2800, "Rack A, shelf 1", alNoor, 2000, 6400);
  const crepe = fabric("Crepe", "Navy", 1400, 2200, "Rack A, shelf 3", alNoor, 2500, 4800);
  const poplin = fabric("Poplin", "White", 900, 1500, "Rack B, shelf 1", deira, 3000, 8600);
  const gabardine = fabric("Gabardine", "Grey", 1200, 1900, "Rack B, shelf 2", deira, 2000, 3900);
  const linen = fabric("Linen", "Beige", 2200, 3400, "Rack C, shelf 1", alNoor, 1000, 600);
  const teal = fabric("Polyester", "Teal", 1100, 1800, "Rack C, shelf 2", deira, 2000, 4200);

  type Prod = { id: string; name: string; price: number; metres: number; fabric: Fab; photo: string };
  const product = (name: string, cat: string, price: number, metres: number, fab: Fab, photo: string): Prod => {
    const found = products.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const id = found?.id ?? randomUUID();
    if (!found) add("products", { id, name, categoryId: catId(cat), kind: "custom", priceFils: price, metresPerPieceCenti: metres, createdBy: by, createdAt: at(ago(110)) });
    return { id, name, price: found?.priceFils || price, metres: found?.metresPerPieceCenti ?? metres, fabric: fab, photo };
  };
  const P = {
    abaya: product("Abaya, classic black", "Abaya", 18000, 350, nida, "abaya"),
    abayaEmb: product("Abaya, embroidered", "Abaya", 26000, 380, nida, "abaya"),
    spaTunic: product("Spa tunic", "Uniforms", 8500, 180, teal, "spa-tunic"),
    spaTrousers: product("Spa trousers", "Uniforms", 6000, 140, nida, "spa-trousers"),
    pinafore: product("School pinafore", "Uniforms", 6500, 160, gabardine, "pinafore"),
    schoolShirt: product("School shirt", "Uniforms", 4500, 150, poplin, "staff-shirt"),
    pants: product("Pants, navy", "Uniforms", 5500, 140, crepe, "pants-navy"),
    staffShirt: product("Staff shirt, long sleeve", "Uniforms", 7000, 170, poplin, "staff-shirt"),
    chef: product("Chef jacket", "Uniforms", 9500, 200, poplin, "chef-jacket"),
    apron: product("Salon apron", "Uniforms", 3500, 80, nida, "spa-trousers"),
    kurti: product("Kurti", "Casual wear", 9000, 220, linen, "staff-shirt"),
    jalabiya: product("Jalabiya", "Casual wear", 15000, 400, linen, "abaya"),
  };
  const productsFor = (name: string): Prod[] => {
    const n = name.toLowerCase();
    if (/spa|salon|beauty|lounge|toes|rituals|juice|hour/.test(n)) return [P.spaTunic, P.spaTrousers, P.apron];
    if (/school|academy|nursery|wonder|ladder|charter/.test(n)) return [P.pinafore, P.schoolShirt];
    if (/catering/.test(n)) return [P.chef, P.pants];
    if (/health/.test(n)) return [P.staffShirt, P.pants];
    return [P.staffShirt, P.pants];
  };

  /* ---------- order building ---------- */
  type Line = { id: string; prod: Prod; qty: number; price: number; net: number; vat: number };
  type Order = {
    id: string; customerId: string; customerName: string; retail: boolean; creditDays: number; stage: Stage; date: string; due: string;
    lines: Line[]; branchId: string | null; poNumber: string | null; quoteId: string | null; number?: string; readyDate?: string; deliveredDate?: string; season?: string | null;
  };
  const orders: Order[] = [];
  const makeLines = (spec: { prod: Prod; qty: number; price?: number }[]): Line[] =>
    spec.map((s) => {
      const price = s.price ?? s.prod.price;
      const a = lineAmounts(s.qty, price, VAT);
      return { id: randomUUID(), prod: s.prod, qty: s.qty, price, net: a.netFils, vat: a.vatFils };
    });
  const order = (c: (typeof customers)[number] | undefined, stage: Stage, days: number, spec: { prod: Prod; qty: number; price?: number }[], extra: Partial<Order> = {}) => {
    if (!c) return null;
    const o: Order = {
      id: randomUUID(), customerId: c.id, customerName: c.name, retail: c.type === "retail", creditDays: c.type === "retail" ? 0 : c.creditDays ?? liveSettings.defaultCreditDays,
      stage, date: ago(days), due: addDaysISO(ago(days), c.type === "retail" ? 10 : 18), lines: makeLines(spec), branchId: null, poNumber: null, quoteId: null, ...extra,
    };
    orders.push(o);
    return o;
  };

  // The orders the missions point at.
  const alDahra = order(live("Al Dahra"), "ready", 12, [{ prod: P.staffShirt, qty: 30 }, { prod: P.pants, qty: 30 }], { poNumber: "ADA-4471" });
  const pinkMeUp = live("Pink Me Up");
  order(pinkMeUp, "invoiced", 58, [{ prod: P.spaTunic, qty: 12, price: 8000 }, { prod: P.spaTrousers, qty: 12 }]);
  order(pinkMeUp, "invoiced", 24, [{ prod: P.apron, qty: 10 }]);
  const bedashing = live("Bedashing");
  const bedBranches = branches.filter((b) => b.customerId === bedashing?.id && !b.deletedAt);
  order(bedashing, "draft", 1, [{ prod: P.spaTunic, qty: 24, price: 8000 }, { prod: P.spaTrousers, qty: 24, price: 5800 }], {
    poNumber: "BDB-PO-26-0377",
    branchId: bedBranches.find((b) => b.name === "Delma")?.id ?? bedBranches[0]?.id ?? null,
    season: "Winter 2026",
  });
  const goodOrder = order(live("Feather Abu Dhabi"), "stitching", 7, [{ prod: P.chef, qty: 8 }]);
  const wrongOrder = order(live("Juice Spa"), "stitching", 6, [{ prod: P.spaTrousers, qty: 10 }]);
  const pantsOrder = order(live("Marina Facilities"), "stitching", 5, [{ prod: P.pants, qty: 75 }], { poNumber: "MFM-PO-2209" });
  const ayan = order(live("Madam Ayan"), "stitching", 4, [{ prod: P.abayaEmb, qty: 2, price: 26000 }]);
  const sameer = order(live("Sameer"), "confirmed", 2, [{ prod: P.jalabiya, qty: 1 }]);
  order(live("Abdullah Bin Otaiba"), "paid", 70, [{ prod: P.jalabiya, qty: 3, price: 16000 }]);
  order(live("Abhishek Arora"), "paid", 44, [{ prod: P.kurti, qty: 2 }]);
  order(live("Ankith"), "delivered", 9, [{ prod: P.kurti, qty: 1 }]);
  order(live("Islamiya"), "paid", 84, [{ prod: P.pinafore, qty: 40 }, { prod: P.schoolShirt, qty: 40 }]);
  order(live("Ferropan Catering"), "invoiced", 40, [{ prod: P.chef, qty: 16 }, { prod: P.pants, qty: 16 }]);

  // The rest, spread across every stage, from the real customer list.
  const target: Record<Stage, number> = { draft: 5, confirmed: 7, stitching: 8, ready: 6, delivered: 6, invoiced: 8, paid: 14 };
  const window: Record<Stage, [number, number]> = { draft: [0, 3], confirmed: [0, 4], stitching: [2, 10], ready: [4, 14], delivered: [6, 18], invoiced: [15, 60], paid: [35, 92] };
  const used = new Set(orders.map((o) => o.customerId));
  const pool = customers.filter((c) => !c.deletedAt && c.type === "wholesale" && !c.isKeyAccount);
  const fresh = pool.filter((c) => !used.has(c.id));
  let again = 0;
  for (const stage of Object.keys(target) as Stage[]) {
    while (orders.filter((o) => o.stage === stage).length < target[stage]) {
      // Every customer gets an order first; after that the regulars order again.
      const c = fresh.shift() ?? pool[again++ % pool.length];
      const options = productsFor(c.name);
      const n = between(1, Math.min(2, options.length));
      const spec = options.slice(0, n).map((prod) => ({ prod, qty: pick([6, 8, 10, 12, 15, 20, 24, 30]), price: prod.price + pick([-500, 0, 0, 500]) }));
      order(c, stage, between(...window[stage]), spec);
    }
  }

  /* ---------- quotes (six, one turned into an order) ---------- */
  type Quote = { id: string; customerId: string; status: "draft" | "sent" | "accepted" | "declined"; date: string; lines: Line[]; orderId: string | null };
  const quotesList: Quote[] = [];
  const quote = (c: (typeof customers)[number] | undefined, status: Quote["status"], days: number, spec: { prod: Prod; qty: number; price?: number }[], orderId: string | null = null) => {
    if (c) quotesList.push({ id: randomUUID(), customerId: c.id, status, date: ago(days), lines: makeLines(spec), orderId });
  };
  quote(live("Tips & Toes Beauty"), "sent", 10, [{ prod: P.spaTunic, qty: 30 }, { prod: P.spaTrousers, qty: 30 }]);
  quote(live("Mia Bella"), "sent", 3, [{ prod: P.spaTunic, qty: 14 }]);
  quote(live("Capital Health"), "draft", 1, [{ prod: P.staffShirt, qty: 25 }]);
  quote(live("Little Wonder Nursery"), "draft", 0, [{ prod: P.pinafore, qty: 18 }]);
  quote(live("Rituals"), "declined", 26, [{ prod: P.spaTunic, qty: 10, price: 9000 }]);
  const islamiyaOrder = orders.find((o) => o.customerName.startsWith("Islamiya"));
  quote(live("Islamiya"), "accepted", 88, [{ prod: P.pinafore, qty: 40 }, { prod: P.schoolShirt, qty: 40 }], islamiyaOrder?.id ?? null);
  const accepted = quotesList.find((q) => q.status === "accepted");
  if (islamiyaOrder && accepted) islamiyaOrder.quoteId = accepted.id;

  /* ---------- tasks, photos, reviews, fabric taken ---------- */
  const RANK: Record<Stage, number> = { draft: -1, confirmed: 0, stitching: 1, ready: 2, delivered: 3, invoiced: 4, paid: 5 };
  const takes = new Map<string, number>();
  let tailorTurn = 0;
  const nextTailor = () => tailorKeys[tailorTurn++ % tailorKeys.length];
  const special = new Map<string, { status: t.TaskStatus; tailor: string; done: number; photo?: string; key?: string }[]>();
  if (goodOrder) special.set(goodOrder.lines[0].id, [{ status: "submitted", tailor: "ahmed", done: 8, photo: "chef-jacket", key: "good" }]);
  if (wrongOrder) special.set(wrongOrder.lines[0].id, [{ status: "submitted", tailor: "imran", done: 10, photo: "wrong-red-top", key: "wrong" }]);
  if (pantsOrder)
    special.set(pantsOrder.lines[0].id, [
      { status: "in_progress", tailor: "ahmed", done: 10, key: "pants:ahmed" },
      { status: "in_progress", tailor: "imran", done: 6, key: "pants:imran" },
      { status: "assigned", tailor: "sajid", done: 0, key: "pants:sajid" },
    ]);
  const keyed: Record<string, string> = {};
  let unitLines = 0;
  const outsourcing: { taskId: string; lineId: string; orderId: string; desc: string; qty: number; date: string }[] = [];
  for (const o of orders) {
    if (o.stage === "draft") continue;
    if (RANK[o.stage] >= RANK.ready) {
      const ready = addDaysISO(o.date, between(5, 10));
      o.readyDate = ready >= T ? ago(1) : ready;
    }
    for (const l of o.lines) {
      type Step = { status: t.TaskStatus; tailor: string; done: number; photo?: string; key?: string };
      const plan: Step[] =
        special.get(l.id) ??
        (o.stage === "confirmed"
          ? [{ status: "assigned" as const, tailor: nextTailor(), done: 0 }]
          : o.stage === "stitching"
            ? [{ status: (R() < 0.5 ? "in_progress" : "assigned") as t.TaskStatus, tailor: nextTailor(), done: 0 }].map((x) => ({ ...x, done: x.status === "in_progress" ? Math.max(1, Math.floor(l.qty * (0.3 + R() * 0.4))) : 0 }))
            : [{ status: "approved" as const, tailor: nextTailor(), done: l.qty }]);
      // Two stitching lines go out to the Ajman unit instead.
      const toUnit = !special.has(l.id) && o.stage === "stitching" && unitLines < 2 && l.qty >= 10;
      for (const step of plan) {
        const id = randomUUID();
        const qty = special.get(l.id) ? (step.key?.startsWith("pants") ? 25 : l.qty) : l.qty;
        if (step.key) keyed[step.key] = id;
        const approvedAt = step.status === "approved" ? at(o.readyDate ?? ago(1), 16) : null;
        add("tasks", {
          id, orderId: o.id, soLineId: l.id, assigneeType: toUnit ? "unit" : "tailor", tailorId: toUnit ? null : tailorIds[step.tailor], supplierId: toUnit ? ajman : null,
          qty, qtyDone: step.done, dueDate: o.due, status: step.status, submittedAt: step.status === "submitted" ? new Date(now - between(2, 6) * 3600_000) : approvedAt,
          approvedAt, createdBy: by, createdAt: at(o.date, 10),
        });
        if (toUnit) {
          unitLines++;
          outsourcing.push({ taskId: id, lineId: l.id, orderId: o.id, desc: l.prod.name, qty, date: o.date });
        }
        if (step.status === "submitted" && step.photo) add("task_photos", { taskId: id, url: `/practice/${step.photo}.jpg`, kind: "submission", createdBy: tailorIds[step.tailor], createdAt: new Date(now - 3 * 3600_000) });
        if (step.status === "approved") {
          if (R() < 0.6) add("task_photos", { taskId: id, url: `/practice/${l.prod.photo}.jpg`, kind: "submission", createdBy: tailorIds[step.tailor], createdAt: approvedAt });
          add("task_reviews", { taskId: id, decision: "approved", createdBy: by, createdAt: approvedAt });
          if (R() < 0.12) add("task_reviews", { taskId: id, decision: "rejected", reason: "Hem uneven on two pieces. Please redo.", createdBy: by, createdAt: at(addDaysISO(o.readyDate ?? ago(2), -1), 12) });
        }
        if (step.status !== "assigned" && !toUnit) {
          const metres = l.prod.metres * qty;
          takes.set(l.prod.fabric.id, (takes.get(l.prod.fabric.id) ?? 0) + metres);
          add("stock_movements", { fabricId: l.prod.fabric.id, kind: "taken", qtyCenti: -metres, movedOn: addDaysISO(o.date, 1), taskId: id, note: `${l.prod.name}, ${o.customerName}`, createdBy: tailorIds[step.tailor], createdAt: at(addDaysISO(o.date, 1), 11) });
        }
      }
    }
  }
  if (keyed.good) add("task_messages", { taskId: keyed.good, kind: "note", body: "All 8 done, buttons sewn twice.", authorName: "Ahmed Raza", createdBy: tailorIds.ahmed, createdAt: new Date(now - 3 * 3600_000) });

  /* ---------- delivery notes, invoices, payments, credit note ---------- */
  type Inv = { id: string; orderId: string; customerId: string; date: string; due: string; lines: Line[]; sub: number; vat: number; total: number; poNumber: string | null };
  const invs: Inv[] = [];
  const dns: { id: string; o: Order; date: string }[] = [];
  const pays: { id: string; customerId: string; orderId: string | null; deposit: boolean; date: string; amount: number; method: t.PaymentMethod; invoiceId: string | null; name: string }[] = [];
  for (const o of orders) {
    if (RANK[o.stage] >= RANK.delivered) {
      o.deliveredDate = addDaysISO(o.readyDate ?? ago(2), between(0, 2)) > T ? T : addDaysISO(o.readyDate ?? ago(2), between(0, 2));
      dns.push({ id: randomUUID(), o, date: o.deliveredDate });
    }
    if (RANK[o.stage] >= RANK.invoiced) {
      const sub = o.lines.reduce((s, l) => s + l.net, 0);
      const vat = o.lines.reduce((s, l) => s + l.vat, 0);
      const date = o.deliveredDate!;
      const inv: Inv = { id: randomUUID(), orderId: o.id, customerId: o.customerId, date, due: addDaysISO(date, o.creditDays), lines: o.lines, sub, vat, total: sub + vat, poNumber: o.poNumber };
      invs.push(inv);
      if (o.stage === "paid") {
        const payDate = addDaysISO(date, o.retail ? 0 : between(8, Math.max(8, o.creditDays + 5)));
        pays.push({ id: randomUUID(), customerId: o.customerId, orderId: null, deposit: false, date: payDate > T ? T : payDate, amount: inv.total, method: o.retail ? pick(["cash", "card"] as const) : pick(["bank_transfer", "bank_transfer", "cheque"] as const), invoiceId: inv.id, name: o.customerName });
      }
    }
  }
  // A part payment on one late invoice, so Who owes you shows every state.
  const partial = invs.find((i) => orders.find((o) => o.id === i.orderId)?.stage === "invoiced" && i.customerId !== pinkMeUp?.id && i.id !== invs.find((x) => orders.find((o) => o.id === x.orderId)?.customerName.startsWith("Ferropan Catering"))?.id);
  if (partial) pays.push({ id: randomUUID(), customerId: partial.customerId, orderId: null, deposit: false, date: addDaysISO(partial.date, 12) > T ? T : addDaysISO(partial.date, 12), amount: Math.round(partial.total * 0.4), method: "bank_transfer", invoiceId: partial.id, name: "part" });
  // Deposits on two retail orders still in the workshop.
  if (ayan) pays.push({ id: randomUUID(), customerId: ayan.customerId, orderId: ayan.id, deposit: true, date: ayan.date, amount: 20000, method: "cash", invoiceId: null, name: ayan.customerName });
  if (sameer) pays.push({ id: randomUUID(), customerId: sameer.customerId, orderId: sameer.id, deposit: true, date: sameer.date, amount: 5000, method: "cash", invoiceId: null, name: sameer.customerName });

  // Numbers in date order, the way they would have been issued.
  const numbered = <X extends { date: string }>(xs: X[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date));
  const seq = new Map(DEFAULT_SEQUENCES.map((d) => [d.docType, { prefix: d.prefix, next: 1001, padding: d.padding }]));
  for (const s of seqs) seq.set(s.docType, { prefix: s.prefix, next: 1001, padding: s.padding });
  const take = (type: t.DocumentType) => {
    const s = seq.get(type)!;
    return `${s.prefix}-${String(s.next++).padStart(s.padding, "0")}`;
  };

  for (const q of numbered(quotesList)) {
    const sub = q.lines.reduce((s, l) => s + l.net, 0);
    const vat = q.lines.reduce((s, l) => s + l.vat, 0);
    add("quotes", { id: q.id, number: take("quote"), customerId: q.customerId, quoteDate: q.date, validUntil: addDaysISO(q.date, liveSettings.quoteValidityDays), status: q.status, subtotalFils: sub, vatFils: vat, totalFils: sub + vat, orderId: q.orderId, createdBy: by, createdAt: at(q.date, 11) });
    add("quote_lines", ...q.lines.map((l, i) => ({ quoteId: q.id, sort: i, productId: l.prod.id, description: l.prod.name, qty: l.qty, unitPriceFils: l.price, vatRateBp: VAT, netFils: l.net, vatFils: l.vat, createdBy: by, createdAt: at(q.date, 11) })));
  }
  for (const o of numbered(orders)) {
    const sub = o.lines.reduce((s, l) => s + l.net, 0);
    const vat = o.lines.reduce((s, l) => s + l.vat, 0);
    add("sales_orders", {
      id: o.id, number: o.stage === "draft" ? null : take("sales_order"), customerId: o.customerId, branchId: o.branchId, quoteId: o.quoteId, customerPoNumber: o.poNumber, orderDate: o.date, dueDate: o.due,
      season: o.season ?? null, stage: o.stage, subtotalFils: sub, vatFils: vat, totalFils: sub + vat,
      readyAt: o.readyDate ? at(o.readyDate, 17) : null, deliveredAt: o.deliveredDate ? at(o.deliveredDate, 15) : null, createdBy: by, createdAt: at(o.date, 10),
    });
    add("so_lines", ...o.lines.map((l, i) => ({
      id: l.id, orderId: o.id, sort: i, productId: l.prod.id, description: l.prod.name, qty: l.qty, unitPriceFils: l.price, vatRateBp: VAT, netFils: l.net, vatFils: l.vat, dueDate: o.due,
      fabricId: l.prod.fabric.id, metresPerPieceCenti: l.prod.metres, createdBy: by, createdAt: at(o.date, 10),
      draftAssignments: o.stage === "draft" ? [] : null,
    })));
  }
  for (const d of numbered(dns)) {
    add("delivery_notes", { id: d.id, number: take("delivery_note"), orderId: d.o.id, customerId: d.o.customerId, branchId: d.o.branchId, deliveryDate: d.date, customerPoNumber: d.o.poNumber, status: "delivered", deliveredAt: at(d.date, 15), createdBy: by, createdAt: at(d.date, 14) });
    add("delivery_note_lines", ...d.o.lines.map((l) => ({ deliveryNoteId: d.id, soLineId: l.id, description: l.prod.name, qty: l.qty, createdBy: by, createdAt: at(d.date, 14) })));
  }
  const invNumber = new Map<string, string>();
  for (const i of numbered(invs)) {
    const number = take("invoice");
    invNumber.set(i.id, number);
    add("invoices", { id: i.id, kind: "tax_invoice", number, customerId: i.customerId, orderId: i.orderId, invoiceDate: i.date, dueDate: i.due, customerPoNumber: i.poNumber, subtotalFils: i.sub, vatFils: i.vat, totalFils: i.total, createdBy: by, createdAt: at(i.date, 16) });
    add("invoice_lines", ...i.lines.map((l, k) => ({ invoiceId: i.id, sort: k, soLineId: l.id, productId: l.prod.id, description: l.prod.name, qty: l.qty, unitPriceFils: l.price, vatRateBp: VAT, netFils: l.net, vatFils: l.vat, createdBy: by, createdAt: at(i.date, 16) })));
  }
  // A credit note: two chef jackets came back in the wrong size.
  const ferropan = invs.find((i) => orders.find((o) => o.id === i.orderId)?.customerName.startsWith("Ferropan Catering"));
  const cnDate = ferropan ? addDaysISO(ferropan.date, 6) : T;
  if (ferropan) {
    const l = ferropan.lines[0];
    const a = lineAmounts(2, l.price, VAT);
    const cnId = randomUUID();
    add("credit_notes", { id: cnId, number: take("credit_note"), invoiceId: ferropan.id, customerId: ferropan.customerId, creditDate: cnDate, reason: "Two pieces returned, wrong size.", subtotalFils: a.netFils, vatFils: a.vatFils, totalFils: a.totalFils, createdBy: by, createdAt: at(cnDate, 12) });
    add("credit_note_lines", { creditNoteId: cnId, description: l.prod.name, qty: 2, unitPriceFils: l.price, vatRateBp: VAT, netFils: a.netFils, vatFils: a.vatFils, createdBy: by, createdAt: at(cnDate, 12) });
  }

  /* ---------- cash book helpers ---------- */
  type Cash = { date: string; pot: t.CashPot; kind: t.CashKind; amount: number; description: string; sourceType: string; sourceId: string };
  const cash: Cash[] = [];
  const pot = (m: t.PaymentMethod): t.CashPot => (m === "cash" ? "cash" : "bank");
  const opening = ago(92);
  const settingsId = liveSettings.id;
  cash.push({ date: opening, pot: "cash", kind: "opening", amount: 350000, description: "Cash in hand on the go live day", sourceType: "opening", sourceId: settingsId });
  cash.push({ date: opening, pot: "bank", kind: "opening", amount: 4500000, description: "Bank balance on the go live day", sourceType: "opening", sourceId: settingsId });

  for (const pmt of numbered(pays)) {
    const number = take("receipt");
    add("payments", { id: pmt.id, number, customerId: pmt.customerId, orderId: pmt.orderId, isDeposit: pmt.deposit, paymentDate: pmt.date, amountFils: pmt.amount, method: pmt.method, reference: pmt.method === "bank_transfer" ? `TRF${between(100000, 999999)}` : pmt.method === "cheque" ? `CHQ ${between(100000, 999999)}` : null, notes: pmt.deposit ? "Advance at the counter" : null, createdBy: by, createdAt: at(pmt.date, 13) });
    if (pmt.invoiceId) add("payment_allocations", { paymentId: pmt.id, invoiceId: pmt.invoiceId, amountFils: pmt.amount, createdBy: by, createdAt: at(pmt.date, 13) });
    const cname = customers.find((c) => c.id === pmt.customerId)?.name ?? "";
    cash.push({ date: pmt.date, pot: pot(pmt.method), kind: "customer_payment", amount: pmt.amount, description: `Receipt ${number}, ${cname}`, sourceType: "payment", sourceId: pmt.id });
  }

  /* ---------- quick sales at the counter ---------- */
  const counterItems = [
    { d: "Alteration, hem", p: 1500 }, { d: "Alteration, sleeves", p: 2500 }, { d: "Shawl, chiffon", p: 3500 }, { d: "Abaya belt", p: 2000 },
    { d: "Buttons and lining", p: 1000 }, { d: "Ready made kurti", p: 8500 }, { d: "Hijab pins, pack", p: 500 },
  ];
  const sales: { id: string; date: string; by: string; method: t.PaymentMethod; lines: { d: string; qty: number; p: number }[] }[] = [];
  for (let k = 0; k < 16; k++) {
    const date = ago(between(1, 88));
    const n = between(1, 2);
    sales.push({ id: randomUUID(), date, by: tailorIds[pick(tailorKeys)], method: R() < 0.7 ? "cash" : "card", lines: Array.from({ length: n }, () => ({ ...(() => { const it = pick(counterItems); return { d: it.d, p: it.p }; })(), qty: between(1, 2) })) });
  }
  for (const s of numbered(sales)) {
    const number = take("pos_sale");
    const ls = s.lines.map((l) => ({ ...l, ...lineAmounts(l.qty, l.p, VAT) }));
    const sub = ls.reduce((a, l) => a + l.netFils, 0);
    const vat = ls.reduce((a, l) => a + l.vatFils, 0);
    add("pos_sales", { id: s.id, number, saleDate: s.date, soldBy: s.by, method: s.method, subtotalFils: sub, vatFils: vat, totalFils: sub + vat, createdBy: s.by, createdAt: at(s.date, 12) });
    add("pos_sale_lines", ...ls.map((l, i) => ({ saleId: s.id, sort: i, description: l.d, qty: l.qty, unitPriceFils: l.p, vatRateBp: VAT, netFils: l.netFils, vatFils: l.vatFils, createdBy: s.by, createdAt: at(s.date, 12) })));
    cash.push({ date: s.date, pot: pot(s.method), kind: "quick_sale", amount: sub + vat, description: `Quick sale ${number}`, sourceType: "pos_sale", sourceId: s.id });
  }

  /* ---------- purchases: three fabric POs received and billed, one stitching unit PO ---------- */
  const poSpecs = [
    { supplier: alNoor, days: 80, lines: [{ f: nida, m: 8000 }, { f: crepe, m: 6000 }], paid: true, trn: "100234567800003" },
    { supplier: deira, days: 46, lines: [{ f: poplin, m: 10000 }, { f: teal, m: 5000 }, { f: gabardine, m: 4000 }], paid: true, trn: "100398112400003" },
    { supplier: alNoor, days: 19, lines: [{ f: linen, m: 2000 }, { f: crepe, m: 5000 }], paid: false, trn: "100234567800003" },
  ];
  const received = new Map<string, number>();
  for (const spec of poSpecs) {
    const poId = randomUUID();
    const date = ago(spec.days);
    const recvDate = addDaysISO(date, 3);
    const lines = spec.lines.map((l, i) => ({ id: randomUUID(), sort: i, f: l.f, m: l.m, ...lineAmountsCenti(l.m, l.f.cost, VAT) }));
    const sub = lines.reduce((s, l) => s + l.netFils, 0);
    const vat = lines.reduce((s, l) => s + l.vatFils, 0);
    const number = take("purchase_order");
    add("purchase_orders", { id: poId, number, kind: "fabric", status: "sent", supplierId: spec.supplier, poDate: date, expectedDate: addDaysISO(date, 4), subtotalFils: sub, vatFils: vat, totalFils: sub + vat, sentAt: at(date, 12), createdBy: by, createdAt: at(date, 11) });
    add("po_lines", ...lines.map((l) => ({ id: l.id, poId, sort: l.sort, fabricId: l.f.id, description: l.f.name, unit: "m", qtyCenti: l.m, unitPriceFils: l.f.cost, vatRateBp: VAT, netFils: l.netFils, vatFils: l.vatFils, createdBy: by, createdAt: at(date, 11) })));
    const receiptId = randomUUID();
    add("goods_receipts", { id: receiptId, poId, receivedDate: recvDate, createdBy: by, createdAt: at(recvDate, 10) });
    add("goods_receipt_lines", ...lines.map((l) => ({ receiptId, poLineId: l.id, qtyCenti: l.m, createdBy: by, createdAt: at(recvDate, 10) })));
    add("stock_movements", ...lines.map((l) => ({ fabricId: l.f.id, kind: "received", qtyCenti: l.m, movedOn: recvDate, receiptId, poId, note: number, createdBy: by, createdAt: at(recvDate, 10) })));
    for (const l of lines) received.set(l.f.id, (received.get(l.f.id) ?? 0) + l.m);
    const billId = randomUUID();
    add("supplier_bills", { id: billId, kind: "bill", supplierId: spec.supplier, poId, billNumber: `INV-${between(20000, 89999)}`, billDate: recvDate, dueDate: addDaysISO(recvDate, 30), supplierTrn: spec.trn, subtotalFils: sub, vatFils: vat, totalFils: sub + vat, createdBy: by, createdAt: at(recvDate, 11) });
    add("supplier_bill_lines", ...lines.map((l) => ({ billId, sort: l.sort, poLineId: l.id, description: l.f.name, unit: "m", qtyCenti: l.m, unitPriceFils: l.f.cost, vatRateBp: VAT, netFils: l.netFils, vatFils: l.vatFils, createdBy: by, createdAt: at(recvDate, 11) })));
    if (spec.paid) {
      const payId = randomUUID();
      const payDate = addDaysISO(recvDate, 25);
      add("supplier_payments", { id: payId, supplierId: spec.supplier, paymentDate: payDate, amountFils: sub + vat, method: "bank_transfer", reference: `TRF${between(100000, 999999)}`, createdBy: by, createdAt: at(payDate, 12) });
      add("supplier_payment_allocations", { paymentId: payId, billId, amountFils: sub + vat, createdBy: by, createdAt: at(payDate, 12) });
      const sname = [...suppliers, ...((rows.suppliers ?? []) as typeof suppliers)].find((s) => s.id === spec.supplier)?.name ?? "supplier";
      cash.push({ date: payDate, pot: "bank", kind: "supplier_payment", amount: -(sub + vat), description: `Paid ${sname}`, sourceType: "supplier_payment", sourceId: payId });
    }
  }
  if (outsourcing.length) {
    const poId = randomUUID();
    const date = outsourcing[0].date;
    const price = 2500;
    const lines = outsourcing.map((o, i) => ({ ...o, sort: i, ...lineAmountsCenti(o.qty * 100, price, VAT) }));
    const sub = lines.reduce((s, l) => s + l.netFils, 0);
    const vat = lines.reduce((s, l) => s + l.vatFils, 0);
    add("purchase_orders", { id: poId, number: take("purchase_order"), kind: "outsourcing", status: "sent", supplierId: ajman, orderId: outsourcing[0].orderId, poDate: date, expectedDate: addDaysISO(date, 10), subtotalFils: sub, vatFils: vat, totalFils: sub + vat, sentAt: at(date, 12), createdBy: by, createdAt: at(date, 11) });
    add("po_lines", ...lines.map((l) => ({ poId, sort: l.sort, soLineId: l.lineId, taskId: l.taskId, description: `Stitching: ${l.desc}`, unit: "pcs", qtyCenti: l.qty * 100, unitPriceFils: price, vatRateBp: VAT, netFils: l.netFils, vatFils: l.vatFils, createdBy: by, createdAt: at(date, 11) })));
  }
  // Opening stock: enough that what is on the shelf today matches the plan, with linen running low.
  for (const f of fabricList) {
    const openingQty = Math.max(0, f.left + (takes.get(f.id) ?? 0) - (received.get(f.id) ?? 0));
    if (openingQty > 0) add("stock_movements", { fabricId: f.id, kind: "opening", qtyCenti: openingQty, movedOn: opening, note: "Opening stock", createdBy: by, createdAt: at(opening, 9) });
  }

  /* ---------- expenses ---------- */
  const expCat = (name: string) => {
    const found = [...expCats, ...((rows.expense_categories ?? []) as typeof expCats)].find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id as string;
    const id = randomUUID();
    add("expense_categories", { id, name, createdBy: by });
    return id;
  };
  const expense = (days: number, cat: string, description: string, payee: string, amount: number, vat: number, p2: t.CashPot, trn: string | null = null) => {
    const id = randomUUID();
    const date = ago(days);
    add("expenses", { id, expenseDate: date, categoryId: expCat(cat), description, payee, payeeTrn: trn, amountFils: amount, vatFils: vat, pot: p2, createdBy: by, createdAt: at(date, 15) });
    cash.push({ date, pot: p2, kind: "expense", amount: -amount, description: `${cat}: ${description}`, sourceType: "expense", sourceId: id });
  };
  for (const m of [85, 55, 25]) {
    expense(m, "Rent", "Shop rent", "Shabiya Properties", 892500, 42500, "bank", "100456789100003");
    expense(m - 3, "Electricity and water", "ADDC bill", "ADDC", between(55000, 78000), 3200, "bank", "100013256400003");
    expense(m - 5, "Phone and internet", "Shop line and internet", "Etisalat", 41895, 1995, "bank", "100027620200003");
  }
  for (let k = 0; k < 7; k++) expense(between(1, 88), "Transport", pick(["Taxi to Deira for fabric", "Delivery to Mussafah", "Courier to Al Ain"]), "", between(3500, 9000), 0, "cash");
  for (let k = 0; k < 6; k++) expense(between(1, 88), "Shop supplies", pick(["Thread and needles", "Interlining and buttons", "Packing bags"]), "Mussafah Trading", between(8000, 18000), 0, "cash");

  /* ---------- salaries: the last two months paid, one advance waiting to come off ---------- */
  const monthOf = (n: number) => {
    const d = new Date(`${T}T00:00:00Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7);
  };
  const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
  for (const n of [2, 1]) {
    const ym = monthOf(n);
    const payDate = `${ym}-28`;
    for (const tl of PRACTICE_TAILORS) {
      const id = randomUUID();
      const uid = tailorIds[tl.key];
      add("salary_payments", { id, userId: uid, month: ym, payDate, grossFils: tl.salary, advancesDeductedFils: 0, netFils: tl.salary, pot: "bank", createdBy: by, createdAt: at(payDate, 18) });
      add("expenses", { expenseDate: payDate, categoryId: expCat("Salaries"), description: `${tl.name}, salary ${monthLabel(ym)}`, payee: tl.name, amountFils: tl.salary, vatFils: 0, pot: "bank", sourceType: "salary_payment", sourceId: id, createdBy: by, createdAt: at(payDate, 18) });
      cash.push({ date: payDate, pot: "bank", kind: "salary", amount: -tl.salary, description: `${tl.name}, salary ${monthLabel(ym)}`, sourceType: "salary_payment", sourceId: id });
    }
  }
  const advanceId = randomUUID();
  const advanceDate = ago(6);
  add("salary_advances", { id: advanceId, userId: tailorIds.imran, advanceDate, amountFils: 50000, pot: "cash", notes: "For his family, to come off this month", createdBy: by, createdAt: at(advanceDate, 17) });
  cash.push({ date: advanceDate, pot: "cash", kind: "advance", amount: -50000, description: "Advance to Imran Ali", sourceType: "salary_advance", sourceId: advanceId });

  /* ---------- embroidery: both directions, one settlement, a balance still open ---------- */
  const share = liveSettings.embroideryShopSharePercent;
  const embroidery = [
    { days: 70, side: "shop", c: live("Islamiya"), d: "School crest on 40 shirts", pieces: 40, price: 60000, done: true },
    { days: 50, side: "operator", c: undefined, name: "Al Wahda Sports Club", d: "Club logo on 25 tracksuits", pieces: 25, price: 50000, done: true },
    { days: 33, side: "shop", c: live("Pink Me Up"), d: "Logo on 12 spa tunics", pieces: 12, price: 24000, done: true },
    { days: 20, side: "operator", c: undefined, name: "Noor Cafe", d: "Name on 8 aprons", pieces: 8, price: 12000, done: true },
    { days: 9, side: "shop", c: live("Tips & Toes Beauty"), d: "Logo on 30 tunics", pieces: 30, price: 45000, done: true },
    { days: 2, side: "shop", c: alDahra ? live("Al Dahra") : undefined, d: "Company logo on 30 shirts", pieces: 30, price: 45000, done: false },
  ];
  for (const e of embroidery) {
    const date = ago(e.days);
    add("embroidery_jobs", { jobDate: date, side: e.side, customerId: e.c?.id ?? null, customerName: e.c ? null : e.name ?? null, description: e.d, pieces: e.pieces, priceFils: e.price, shopSharePercent: share, status: e.done ? "done" : "to_do", doneAt: e.done ? at(addDaysISO(date, 2), 16) : null, threadColours: "Gold, white", designSize: "8 x 6 cm", placement: "Left chest", createdBy: by, createdAt: at(date, 12) });
  }
  const settleId = randomUUID();
  const settleDate = ago(40);
  add("operator_settlements", { id: settleId, settleDate, direction: "to_operator", amountFils: 30000, pot: "cash", notes: "Share for the school crests", createdBy: by, createdAt: at(settleDate, 17) });
  const opName = liveSettings.embroideryOperatorName || "Rafiq";
  cash.push({ date: settleDate, pot: "cash", kind: "embroidery", amount: -30000, description: `Paid ${opName}, embroidery share`, sourceType: "operator_settlement", sourceId: settleId });

  /* ---------- two daily closes: one matched, one short ---------- */
  const cashUpTo = (date: string) => cash.filter((c) => c.pot === "cash" && c.date <= date).reduce((s, c) => s + c.amount, 0);
  const cardOn = (date: string) => cash.filter((c) => c.pot === "bank" && c.date === date && (c.kind === "quick_sale" || c.kind === "customer_payment")).reduce((s, c) => s + Math.max(0, c.amount), 0);
  for (const [days, diff] of [[2, 0], [1, -2000]] as const) {
    const date = ago(days);
    const id = randomUUID();
    const expected = cashUpTo(date);
    add("daily_closes", { id, closeDate: date, expectedCashFils: expected, countedCashFils: expected + diff, differenceFils: diff, cardTotalFils: cardOn(date), notes: diff ? "Short by 20. Probably change given twice." : null, createdBy: by, createdAt: at(date, 21) });
    if (diff) cash.push({ date, pot: "cash", kind: "close_difference", amount: diff, description: "Less cash counted than expected", sourceType: "daily_close", sourceId: id });
  }
  add("cash_book", ...cash.map((c) => ({ entryDate: c.date, pot: c.pot, kind: c.kind, amountFils: c.amount, description: c.description, sourceType: c.sourceType, sourceId: c.sourceId, createdBy: by, createdAt: at(c.date, 20) })));

  /* ---------- Bedashing account: staff and agreed prices ---------- */
  if (bedashing) {
    const kca = bedBranches.find((b) => b.name === SAMPLE_BRANCHES[0]);
    const barsha = bedBranches.find((b) => b.name === SAMPLE_BRANCHES[1]);
    if (!items.some((i) => i.customerId === bedashing.id)) {
      add("account_items",
        { customerId: bedashing.id, productId: P.spaTunic.id, name: "Spa tunic, black with pink piping", agreedPriceFils: 8000, sortOrder: 0, createdBy: by },
        { customerId: bedashing.id, productId: P.spaTrousers.id, name: "Spa trousers, black", agreedPriceFils: 5800, sortOrder: 1, createdBy: by },
        { customerId: bedashing.id, productId: P.apron.id, name: "Salon apron, pink", agreedPriceFils: 3200, sortOrder: 2, createdBy: by },
      );
    }
    if (!staff.some((s) => s.customerId === bedashing.id)) {
      const people = [
        [kca, "Maria Santos", "Senior therapist", "Top M, Pant 30"], [kca, "Grace Mwangi", "Therapist", "Top S, Pant 28"], [kca, "Hala Saeed", "Receptionist", "Top M, Pant 32"],
        [barsha, "Joy Fernandes", "Nail technician", "Top L, Pant 34"], [barsha, "Aisha Rahman", "Therapist", "Top S, Pant 28"],
      ] as const;
      for (const [b, name, role, sizes] of people) add("account_staff", { customerId: bedashing.id, branchId: b?.id ?? null, name, role, sizes, createdBy: by });
    }
  }

  /* ---------- a few things that happened while she was away ---------- */
  if (owner) {
    const notes = [
      { kind: "task_submitted", title: "Ahmed Raza sent work to review", body: "Chef jacket, 8 pieces.", href: keyed.good ? `/workshop/tasks/${keyed.good}` : "/workshop" },
      { kind: "task_submitted", title: "Imran Ali sent work to review", body: "Spa trousers, 10 pieces.", href: keyed.wrong ? `/workshop/tasks/${keyed.wrong}` : "/workshop" },
    ];
    for (const n of notes) add("notifications", { userId: owner.id, ...n, createdAt: new Date(now - 2 * 3600_000) });
  }

  /* ---------- write it all ---------- */
  const settingsRow = {
    ...liveSettings,
    openingCashFils: 350000,
    openingBankFils: 4500000,
    openingDate: opening,
    embroideryOperatorName: opName,
    setupComplete: true,
    setupStep: "done",
  };
  // Owners appear in the sandbox so their name sits on what they do there. They never sign in against it.
  const ownerRows = owners.map((o) => ({ ...o, passwordHash: "!", practiceMode: false }));
  const sequences = [...seq.entries()].map(([docType, s]) => ({ docType, prefix: s.prefix, nextNumber: s.next, padding: s.padding }));
  const meta: PracticeMeta = {
    seededAt: new Date().toISOString(),
    goodTaskId: keyed.good,
    wrongTaskId: keyed.wrong,
    alDahraOrderId: alDahra?.id ?? null,
    pinkMeUpId: pinkMeUp?.id ?? null,
    mehwishId: live("Ma'am Mehwish")?.id ?? null,
    bedashingId: bedashing?.id ?? null,
    quoteCustomerId: (live("Islamiya") ?? customers.find((c) => c.type === "wholesale" && !c.deletedAt && !c.isKeyAccount))?.id ?? null,
    imranId: tailorIds.imran,
    alNoorId: alNoor,
    pantsTasks: { [tailorIds.ahmed]: keyed["pants:ahmed"], [tailorIds.imran]: keyed["pants:imran"], [tailorIds.sajid]: keyed["pants:sajid"] },
    tailorIds,
  };

  const order_: [string, PgTable][] = [
    ["users", t.users], ["product_categories", t.productCategories], ["products", t.products], ["suppliers", t.suppliers], ["fabrics", t.fabrics],
    ["expense_categories", t.expenseCategories], ["quotes", t.quotes], ["quote_lines", t.quoteLines], ["sales_orders", t.salesOrders], ["so_lines", t.soLines],
    ["tasks", t.tasks], ["task_photos", t.taskPhotos], ["task_reviews", t.taskReviews], ["task_messages", t.taskMessages], ["delivery_notes", t.deliveryNotes],
    ["delivery_note_lines", t.deliveryNoteLines], ["invoices", t.invoices], ["invoice_lines", t.invoiceLines], ["credit_notes", t.creditNotes], ["credit_note_lines", t.creditNoteLines],
    ["payments", t.payments], ["payment_allocations", t.paymentAllocations], ["pos_sales", t.posSales], ["pos_sale_lines", t.posSaleLines], ["purchase_orders", t.purchaseOrders],
    ["po_lines", t.poLines], ["goods_receipts", t.goodsReceipts], ["goods_receipt_lines", t.goodsReceiptLines], ["stock_movements", t.stockMovements], ["supplier_bills", t.supplierBills],
    ["supplier_bill_lines", t.supplierBillLines], ["supplier_payments", t.supplierPayments], ["supplier_payment_allocations", t.supplierPaymentAllocations], ["expenses", t.expenses],
    ["salary_payments", t.salaryPayments], ["salary_advances", t.salaryAdvances], ["embroidery_jobs", t.embroideryJobs], ["operator_settlements", t.operatorSettlements],
    ["daily_closes", t.dailyCloses], ["cash_book", t.cashBook], ["account_items", t.accountItems], ["account_staff", t.accountStaff], ["notifications", t.notifications],
  ];

  const statements: unknown[] = [
    p.insert(t.settings).values(settingsRow),
    p.insert(t.numberSequences).values(sequences),
    ...(ownerRows.length ? [p.insert(t.users).values(ownerRows)] : []),
    ...chunks(customers, 200).map((c) => p.insert(t.customers).values(c)),
    ...chunks(branches, 200).map((c) => p.insert(t.customerBranches).values(c)),
    ...chunks(fields, 200).map((c) => p.insert(t.measurementFields).values(c)),
    ...chunks(templates, 200).map((c) => p.insert(t.measurementTemplates).values(c)),
    ...chunks(cats, 200).map((c) => p.insert(t.productCategories).values(c)),
    ...chunks(products, 200).map((c) => p.insert(t.products).values(c)),
    ...chunks(suppliers, 200).map((c) => p.insert(t.suppliers).values(c)),
    ...chunks(fabrics, 200).map((c) => p.insert(t.fabrics).values(c)),
    ...chunks(expCats, 200).map((c) => p.insert(t.expenseCategories).values(c)),
    ...chunks(measures, 200).map((c) => p.insert(t.customerMeasurements).values(c)),
    ...chunks(staff, 200).map((c) => p.insert(t.accountStaff).values(c)),
    ...chunks(items, 200).map((c) => p.insert(t.accountItems).values(c)),
  ];
  for (const [name, table] of order_) for (const c of chunks(rows[name] ?? [], 250)) statements.push(p.insert(table).values(c as never));
  statements.push(p.insert(t.practiceMeta).values({ key: "meta", value: meta }));
  await p.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  return meta;
}

function chunks<X>(xs: X[], n: number): X[][] {
  const out: X[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
