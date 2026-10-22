import { sql } from "drizzle-orm";
import { customers, salesOrders } from "@/db/schema";

export const orderListColumns = {
  id: salesOrders.id,
  number: salesOrders.number,
  stage: salesOrders.stage,
  dueDate: salesOrders.dueDate,
  totalFils: salesOrders.totalFils,
  createdAt: salesOrders.createdAt,
  customerId: salesOrders.customerId,
  customerName: customers.name,
  customerTier: customers.tier,
  pieces: sql<number>`(select coalesce(sum(l.qty), 0)::int from so_lines l where l.order_id = ${salesOrders.id})`,
  done: sql<number>`(select coalesce(sum(t.qty_done), 0)::int from tasks t where t.order_id = ${salesOrders.id})`,
  approved: sql<number>`(select coalesce(sum(t.qty), 0)::int from tasks t where t.order_id = ${salesOrders.id} and t.status = 'approved')`,
};
