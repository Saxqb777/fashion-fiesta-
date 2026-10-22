import { sql } from "drizzle-orm";
import { customers, salesOrders, soLines, tasks } from "@/db/schema";
import { todayISO } from "./dates";

export const taskCardColumns = {
  id: tasks.id,
  status: tasks.status,
  qty: tasks.qty,
  qtyDone: tasks.qtyDone,
  dueDate: tasks.dueDate,
  openQuestion: tasks.openQuestion,
  assigneeType: tasks.assigneeType,
  tailorId: tasks.tailorId,
  supplierId: tasks.supplierId,
  orderId: tasks.orderId,
  orderNumber: salesOrders.number,
  customerName: customers.name,
  customerTier: customers.tier,
  description: soLines.description,
  measurementLabel: soLines.measurementLabel,
  photoUrl: sql<string | null>`coalesce(
    (select p.url from task_photos p where p.task_id = ${tasks.id} order by p.created_at desc limit 1),
    (select f.photo_url from fabrics f where f.id = ${soLines.fabricId})
  )`,
  fabricShelf: sql<string | null>`(select f.shelf_location from fabrics f where f.id = ${soLines.fabricId})`,
};

export type TaskCardRow = {
  [K in keyof typeof taskCardColumns]: (typeof taskCardColumns)[K] extends { _: { data: infer D } } ? D : never;
};

/** Overdue first, then soonest due, then oldest. */
export function taskOrder() {
  const today = todayISO();
  return [
    sql`case when ${tasks.status} <> 'approved' and ${tasks.dueDate} < ${today} then 0 else 1 end`,
    sql`${tasks.dueDate} asc nulls last`,
    sql`${tasks.createdAt} asc`,
  ];
}
