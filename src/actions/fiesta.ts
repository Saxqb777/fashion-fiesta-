"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";
import { db } from "@/db";
import { fiestaConversations, fiestaMessages } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { importDrafts } from "./documents";
import { sendDocEmail } from "./email";
import { recordPayment } from "./money";
import { reassignTask } from "./tasks";

/** What the panel shows when a conversation is opened again. */
export type FiestaItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "card"; id: string; card: unknown; confirmed: boolean }
  | { kind: "nav"; path: string; label: string };

const CONFIRMED = /^Confirmed card (\S+):/;

async function ownConversation(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await db.query.fiestaConversations.findFirst({ where: and(eq(fiestaConversations.id, id), eq(fiestaConversations.userId, userId)) })) ?? null;
}

export async function loadConversation(id: string): Promise<{ title: string; items: FiestaItem[] } | null> {
  const me = await requireOwner();
  const convo = await ownConversation(id, me.id);
  if (!convo) return null;
  const rows = await db.select().from(fiestaMessages).where(eq(fiestaMessages.conversationId, id)).orderBy(asc(fiestaMessages.seq));
  type Block = { type: string; text?: string; name?: string; input?: { path?: string; label?: string }; tool_use_id?: string; content?: unknown };
  const confirmed = new Set<string>();
  for (const r of rows) for (const b of r.content as Block[]) if (b.type === "text" && b.text && CONFIRMED.test(b.text)) confirmed.add(b.text.match(CONFIRMED)![1]);
  const items: FiestaItem[] = [];
  for (const r of rows) {
    const blocks = r.content as Block[];
    if (r.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      if (text.trim()) items.push({ kind: "assistant", text });
      for (const b of blocks) if (b.type === "tool_use" && b.name === "navigate" && b.input?.path) items.push({ kind: "nav", path: b.input.path, label: b.input.label ?? b.input.path });
      continue;
    }
    for (const b of blocks) {
      if (b.type === "tool_result" && typeof b.content === "string" && b.tool_use_id) {
        try {
          const parsed = JSON.parse(b.content) as { card?: unknown };
          if (parsed.card) items.push({ kind: "card", id: b.tool_use_id, card: parsed.card, confirmed: confirmed.has(b.tool_use_id) });
        } catch {
          // Not a card.
        }
      }
    }
    // Her own words are the last text block; the first carries the date and screen for the model.
    const texts = blocks.filter((b) => b.type === "text" && b.text && !b.text.startsWith("<context>") && !CONFIRMED.test(b.text));
    if (texts.length) items.push({ kind: "user", text: texts.map((b) => b.text).join("\n") });
  }
  return { title: convo.title, items };
}

export async function deleteConversation(id: string) {
  const me = await requireOwner();
  const convo = await ownConversation(id, me.id);
  if (convo) await db.delete(fiestaConversations).where(eq(fiestaConversations.id, convo.id));
}

const money = (fils: number) => (fils / 100).toFixed(2);
const id = z.string().regex(/^[0-9a-f-]{36}$/);
const cardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("payment"), customerId: id, customerName: z.string(), amount: z.number().int().positive(), method: z.enum(["cash", "card", "bank_transfer", "cheque"]), invoiceId: id.nullable(), invoiceNumber: z.string().nullable(), reference: z.string().nullable() }),
  z.object({ kind: z.literal("assign"), taskId: id, taskLabel: z.string(), tailorId: id, tailorName: z.string() }),
  z.object({
    kind: z.literal("draft"),
    mode: z.enum(["order", "quote"]),
    customerId: id,
    customerName: z.string(),
    branchId: id.nullable(),
    branchName: z.string().nullable(),
    customerPoNumber: z.string().nullable(),
    notes: z.string().nullable(),
    lines: z.array(z.object({ description: z.string().min(1), qty: z.number().int().min(1), unitPrice: z.number().int().min(0) })).min(1),
  }),
  z.object({ kind: z.literal("email"), customerId: id, customerName: z.string(), to: z.string(), subject: z.string(), body: z.string() }),
]);

/**
 * Her tap on a card. The card is checked again and handed to the same actions the screens use,
 * so every rule that applies on the page applies here too. Only then is it marked confirmed in the chat.
 */
export async function confirmCard(input: { conversationId: string; toolUseId: string; card: unknown }): Promise<{ ok?: boolean; error?: string; href?: string; message?: string }> {
  const me = await requireOwner();
  const convo = await ownConversation(input.conversationId, me.id);
  if (!convo || !/^[\w-]{6,80}$/.test(input.toolUseId)) return { error: "This card is no longer available." };
  const parsed = cardSchema.safeParse(input.card);
  if (!parsed.success) return { error: "This card cannot be confirmed." };
  const card = parsed.data;
  const mark = async (summary: string) => {
    const [last] = await db.select({ n: sql<number>`coalesce(max(${fiestaMessages.seq}), -1)::int` }).from(fiestaMessages).where(eq(fiestaMessages.conversationId, convo.id));
    const next = (last?.n ?? -1) + 1;
    await db.insert(fiestaMessages).values({ conversationId: convo.id, seq: next, role: "user", content: [{ type: "text", text: `Confirmed card ${input.toolUseId}: ${summary}` }], createdBy: me.id });
  };

  if (card.kind === "payment") {
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        customerId: card.customerId,
        orderId: null,
        deposit: false,
        date: todayISO(),
        amount: money(card.amount),
        method: card.method,
        reference: card.reference ?? "",
        notes: "Recorded from Fiesta",
        allocations: card.invoiceId ? [{ invoiceId: card.invoiceId, amount: money(card.amount) }] : [],
      }),
    );
    try {
      const res = await recordPayment(EMPTY_FORM_STATE, fd);
      return { error: res.message ?? "The payment was not saved. Check it on the payment screen." };
    } catch (e) {
      // Saved: the action sends her to the receipt.
      if (isRedirectError(e)) await mark(`payment of ${formatFils(card.amount)} from ${card.customerName} recorded`);
      throw e;
    }
  }

  if (card.kind === "assign") {
    const fd = new FormData();
    fd.set("taskId", card.taskId);
    fd.set("assignee", `tailor:${card.tailorId}`);
    const res = await reassignTask(EMPTY_FORM_STATE, fd);
    if (!res.ok) return { error: res.message ?? res.errors?.assignee?.[0] ?? "The task was not changed." };
    await mark(`${card.taskLabel} given to ${card.tailorName}`);
    return { ok: true, message: `Given to ${card.tailorName}.`, href: `/workshop/tasks/${card.taskId}` };
  }

  if (card.kind === "draft") {
    const res = await importDrafts({
      mode: card.mode,
      docs: [
        {
          customerId: card.customerId,
          branchId: card.branchId,
          date: todayISO(),
          notes: card.notes ?? "",
          customerPoNumber: card.customerPoNumber ?? "",
          lines: card.lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: money(l.unitPrice) })),
        },
      ],
    });
    if (!res.ok) return { error: res.error ?? "The draft was not saved." };
    await mark(`${card.mode === "order" ? "draft order" : "quote"} for ${card.customerName} saved`);
    return { ok: true, message: card.mode === "order" ? "Draft order saved. Check it, then confirm." : "Quote saved as a draft.", href: card.mode === "order" ? "/orders?view=drafts" : "/orders/quotes?status=draft" };
  }

  const res = await sendDocEmail({ type: "statement", id: card.customerId, to: card.to, subject: card.subject, body: card.body });
  if (!res.ok) return { error: res.error ?? "The email was not sent." };
  await mark(`statement emailed to ${card.to}`);
  return { ok: true, message: `Sent to ${card.to}.` };
}
