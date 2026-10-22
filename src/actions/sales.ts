"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { posSaleLines, posSales } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cashEntry, potFor } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { moneySchema, type FormState } from "@/lib/forms";
import { documentTotals, lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/numbering";
import { issuesToErrors, uuidOrNull } from "@/lib/payload";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

const saleSchema = z.object({
  method: z.enum(["cash", "card"], { message: "Cash or card?" }),
  customerName: z.string().trim().max(120).optional().default(""),
  customerPhone: z.string().trim().max(40).optional().default(""),
  lines: z
    .array(
      z.object({
        productId: uuidOrNull,
        description: z.string().trim().min(1, "What is it?").max(200),
        qty: z.number({ message: "How many?" }).int("Whole pieces.").min(1, "At least 1.").max(1000),
        unitPrice: moneySchema.refine((v) => v > 0, "Enter the price."),
      }),
    )
    .min(1, "Add at least one item."),
});

/**
 * A counter sale by an owner or any tailor. Issues a Simplified Tax Invoice (FF-POS)
 * and puts the money in the drawer (cash) or the bank (card).
 */
export async function createQuickSale(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  let raw: unknown = {};
  try {
    raw = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {}
  // Cash or card comes from the button that was tapped.
  const parsed = saleSchema.safeParse({ ...(raw as object), method: String(fd.get("method") ?? "") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the sale.", errors: issuesToErrors(parsed.error) };
  const s = parsed.data;
  const { vatRateBp } = await getSettings();
  const rows = s.lines.map((l, i) => {
    const { netFils, vatFils } = lineAmounts(l.qty, l.unitPrice, vatRateBp);
    return { sort: i, productId: l.productId, description: l.description, qty: l.qty, unitPriceFils: l.unitPrice, vatRateBp, netFils, vatFils };
  });
  const totals = documentTotals(rows);
  const id = randomUUID();
  const number = await nextDocumentNumber("pos_sale");
  const date = todayISO();
  await db.batch([
    db.insert(posSales).values({
      id,
      number,
      saleDate: date,
      soldBy: me.id!,
      customerName: s.customerName || null,
      customerPhone: s.customerPhone || null,
      method: s.method,
      ...totals,
      createdBy: me.id,
    }),
    db.insert(posSaleLines).values(rows.map((r) => ({ saleId: id, ...r, createdBy: me.id }))),
    cashEntry({ date, pot: potFor(s.method), kind: "quick_sale", amountFils: totals.totalFils, description: `Quick sale ${number}`, sourceType: "pos_sale", sourceId: id, actorId: me.id }),
  ]);
  await logActivity({ actor: me, entityType: "pos_sale", entityId: id, action: "created", summary: `${me.name} sold ${formatFils(totals.totalFils)} by ${s.method}, ${number}` });
  revalidatePath("/money", "layout");
  revalidatePath("/today", "layout");
  redirect(`/today/sale/${id}?celebrate=paid`);
}
