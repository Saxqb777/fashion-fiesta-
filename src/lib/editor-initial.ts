import { asc, eq } from "drizzle-orm";
import { getCustomerContext } from "@/actions/documents";
import { db } from "@/db";
import { quoteLines, quotes, salesOrders, soLines, tasks } from "@/db/schema";
import type { EditorAssignment, EditorInitial, EditorLine } from "@/components/orders/document-editor";
import type { DraftAssignment, Task } from "@/db/schema";
import { addDaysISO, todayISO } from "./dates";
import { taskLocked } from "./stages";

const money = (fils: number) => (fils / 100).toFixed(2);
let n = 0;
const k = () => `s${n++}`;

export async function initialForNewOrder(opts: { copy?: string; fromQuote?: string; customer?: string }): Promise<EditorInitial> {
  const today = todayISO();
  const base: EditorInitial = { context: null, branchId: "", date: today, dueDate: "", validUntil: "", notes: "", lines: [] };

  if (opts.fromQuote && /^[0-9a-f-]{36}$/.test(opts.fromQuote)) {
    const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, opts.fromQuote) });
    if (quote && quote.status !== "accepted") {
      const lines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).orderBy(asc(quoteLines.sort));
      return {
        ...base,
        context: await getCustomerContext(quote.customerId),
        branchId: quote.branchId ?? "",
        notes: quote.notes ?? "",
        sourceQuoteId: quote.id,
        customerPoFile: quote.customerPoFileUrl ? { url: quote.customerPoFileUrl, name: quote.customerPoFileName ?? "Customer PO file" } : null,
        lines: lines.map((l) => ({
          key: k(),
          productId: l.productId,
          description: l.description,
          qty: String(l.qty),
          unitPrice: money(l.unitPriceFils),
          notes: l.notes ?? "",
          dueDate: "",
          fabricId: "",
          measurementId: "",
          assignments: [],
        })),
      };
    }
  }

  if (opts.copy && /^[0-9a-f-]{36}$/.test(opts.copy)) {
    const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, opts.copy) });
    if (order) {
      const [lines, context] = await Promise.all([
        db.select().from(soLines).where(eq(soLines.orderId, order.id)).orderBy(asc(soLines.sort)),
        getCustomerContext(order.customerId),
      ]);
      const liveSets = new Set(context?.measurements.map((m) => m.id));
      return {
        ...base,
        context,
        branchId: order.branchId ?? "",
        notes: order.notes ?? "",
        lines: lines.map((l) => ({
          key: k(),
          productId: l.productId,
          description: l.description,
          qty: String(l.qty),
          // Order again: the price they paid last time.
          unitPrice: money(l.unitPriceFils),
          notes: l.notes ?? "",
          dueDate: "",
          fabricId: l.fabricId ?? "",
          metresPerPiece: l.metresPerPieceCenti ? (l.metresPerPieceCenti / 100).toFixed(2) : "",
          measurementId: l.measurementId && liveSets.has(l.measurementId) ? l.measurementId : "",
          assignments: [],
        })),
      };
    }
  }

  if (opts.customer && /^[0-9a-f-]{36}$/.test(opts.customer)) {
    return { ...base, context: await getCustomerContext(opts.customer) };
  }
  return base;
}

export async function initialForOrderEdit(orderId: string): Promise<EditorInitial | null> {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order) return null;
  const [lines, ts, context] = await Promise.all([
    db.select().from(soLines).where(eq(soLines.orderId, order.id)).orderBy(asc(soLines.sort)),
    db.select().from(tasks).where(eq(tasks.orderId, order.id)).orderBy(asc(tasks.createdAt)),
    getCustomerContext(order.customerId),
  ]);
  return {
    id: order.id,
    number: order.number ?? undefined,
    isDraft: order.stage === "draft",
    context,
    branchId: order.branchId ?? "",
    date: order.orderDate,
    dueDate: order.dueDate ?? "",
    validUntil: "",
    notes: order.notes ?? "",
    customerPoNumber: order.customerPoNumber ?? "",
    customerPoFile: order.customerPoFileUrl ? { url: order.customerPoFileUrl, name: order.customerPoFileName ?? "Customer PO file" } : null,
    lines: lines.map(
      (l): EditorLine => ({
        key: k(),
        id: l.id,
        productId: l.productId,
        description: l.description,
        qty: String(l.qty),
        unitPrice: money(l.unitPriceFils),
        notes: l.notes ?? "",
        dueDate: l.dueDate ?? "",
        fabricId: l.fabricId ?? "",
        metresPerPiece: l.metresPerPieceCenti ? (l.metresPerPieceCenti / 100).toFixed(2) : "",
        measurementId: l.measurementId ?? "",
        measurementLabel: l.measurementLabel,
        assignments: assignmentsFor(order.stage === "draft", l.draftAssignments, ts.filter((t) => t.soLineId === l.id)),
      }),
    ),
  };
}

export async function initialForQuote(quoteId?: string, customer?: string): Promise<EditorInitial | null> {
  const today = todayISO();
  if (!quoteId) {
    return {
      context: customer && /^[0-9a-f-]{36}$/.test(customer) ? await getCustomerContext(customer) : null,
      branchId: "",
      date: today,
      dueDate: "",
      validUntil: addDaysISO(today, 14),
      notes: "",
      lines: [],
    };
  }
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
  if (!quote) return null;
  const lines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).orderBy(asc(quoteLines.sort));
  return {
    id: quote.id,
    number: quote.number,
    context: await getCustomerContext(quote.customerId),
    branchId: quote.branchId ?? "",
    date: quote.quoteDate,
    dueDate: "",
    validUntil: quote.validUntil ?? "",
    notes: quote.notes ?? "",
    customerPoFile: quote.customerPoFileUrl ? { url: quote.customerPoFileUrl, name: quote.customerPoFileName ?? "Customer PO file" } : null,
    lines: lines.map((l) => ({
      key: k(),
      productId: l.productId,
      description: l.description,
      qty: String(l.qty),
      unitPrice: money(l.unitPriceFils),
      notes: l.notes ?? "",
      dueDate: "",
      fabricId: "",
      measurementId: "",
      assignments: [],
    })),
  };
}

function assignmentsFor(isDraft: boolean, planned: DraftAssignment[] | null, lineTasks: Task[]): EditorAssignment[] {
  if (isDraft) {
    return (planned ?? []).map((a) => ({ key: k(), taskId: null, type: a.type, assigneeId: a.assigneeId, qty: String(a.qty), locked: false }));
  }
  return lineTasks.map((t) => ({
    key: k(),
    taskId: t.id,
    type: t.assigneeType,
    assigneeId: (t.tailorId ?? t.supplierId)!,
    qty: String(t.qty),
    locked: taskLocked(t),
  }));
}
