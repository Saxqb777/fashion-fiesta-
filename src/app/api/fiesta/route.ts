import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fiestaConversations, fiestaMessages } from "@/db/schema";
import { auth } from "@/lib/auth";
import { formatISODate } from "@/lib/dates";
import { FIESTA_MODEL, FIESTA_SYSTEM } from "@/lib/fiesta/prompt";
import { dateHint, runTool, TOOL_LABEL, TOOL_PARAMS } from "@/lib/fiesta/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({
  conversationId: z.string().regex(/^[0-9a-f-]{36}$/).nullable().optional(),
  text: z.string().trim().min(1).max(4000),
  screen: z.object({ path: z.string().max(300), title: z.string().max(200), text: z.string().max(8000) }).nullable().optional(),
});

/** Turns per question: enough to look a few things up and prepare a card, never an endless loop. */
const MAX_TURNS = 10;

type Event =
  | { t: "start"; conversationId: string; title: string }
  | { t: "text"; d: string }
  | { t: "tool"; label: string }
  | { t: "card"; id: string; card: unknown }
  | { t: "nav"; path: string; label: string }
  | { t: "error"; message: string }
  | { t: "done" };

/**
 * Fiesta's chat. Streams one line of JSON per event: words as they come, a short "looking at"
 * note while a tool runs, cards for anything she must confirm, and pages to open.
 * The transcript is stored exactly as exchanged and only ever appended to.
 */
export async function POST(request: Request) {
  const session = await auth();
  const me = session?.user;
  if (me?.role !== "owner" || me.practiceOnly) return new Response("Fiesta is for owners.", { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response("Fiesta is not connected yet.", { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const input = parsed.data;

  let convo = input.conversationId
    ? await db.query.fiestaConversations.findFirst({ where: and(eq(fiestaConversations.id, input.conversationId), eq(fiestaConversations.userId, me.id)) })
    : undefined;
  if (!convo) [convo] = await db.insert(fiestaConversations).values({ userId: me.id, title: input.text.slice(0, 80), createdBy: me.id }).returning();
  const conversationId = convo.id;

  const past = await db.select().from(fiestaMessages).where(eq(fiestaMessages.conversationId, conversationId)).orderBy(asc(fiestaMessages.seq));
  const messages: Anthropic.Beta.BetaMessageParam[] = past.map((m) => ({ role: m.role, content: m.content as Anthropic.Beta.BetaContentBlockParam[] }));
  let seq = past.length ? past[past.length - 1].seq + 1 : 0;
  const append = async (role: "user" | "assistant", content: unknown[]) => {
    messages.push({ role, content: content as Anthropic.Beta.BetaContentBlockParam[] });
    await db.insert(fiestaMessages).values({ conversationId, seq: seq++, role, content, createdBy: me.id });
  };

  // Today's date and the screen she is on travel with her words, so the system prompt stays cacheable.
  const d = dateHint();
  const context = [
    `Today is ${formatISODate(d.today, true)} (${d.today}). This week started ${d.weekAgo}; this month started ${d.monthStart}.`,
    `She is ${me.name ?? "the owner"}${me.practice ? ", in Practice mode: the data is a made up sandbox, not the real shop" : ""}.`,
    input.screen ? `She is on ${input.screen.path} ("${input.screen.title}"). What the screen shows:\n${input.screen.text}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await append("user", [
    { type: "text", text: `<context>\n${context}\n</context>` },
    { type: "text", text: input.text },
  ]);
  await db.update(fiestaConversations).set({ updatedAt: new Date() }).where(eq(fiestaConversations.id, conversationId));

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      send({ t: "start", conversationId, title: convo.title });
      let jsonRetries = 0;
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const run = client.beta.messages.stream({
            model: FIESTA_MODEL,
            max_tokens: 16000,
            system: [{ type: "text", text: FIESTA_SYSTEM, cache_control: { type: "ephemeral" } }],
            tools: TOOL_PARAMS,
            messages,
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            cache_control: { type: "ephemeral" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          });
          run.on("text", (delta) => send({ t: "text", d: delta }));
          let message: Anthropic.Beta.BetaMessage;
          try {
            message = await run.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            // A tool input that could not be parsed at all: ask again, a couple of times at most.
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
            turn--;
            continue;
          }
          await append("assistant", message.content);
          if (message.stop_reason === "refusal") {
            send({ t: "text", d: "\n\nI can't help with that one." });
            break;
          }
          if (message.stop_reason === "pause_turn") continue;
          const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (!calls.length) break;
          if (message.stop_reason === "max_tokens") {
            send({ t: "error", message: "That answer ran too long. Ask again in a narrower way." });
            break;
          }
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const call of calls) {
            send({ t: "tool", label: TOOL_LABEL[call.name] ?? "Looking it up" });
            const out = await runTool(call.name, call.input, { userId: me.id });
            if (out.card) send({ t: "card", id: call.id, card: out.card });
            if (out.navigate) send({ t: "nav", ...out.navigate });
            // The card rides in the result too, so the history shows it again when the chat is reopened.
            results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out.card ? { ...(out.result as object), card: out.card } : out.result), is_error: out.isError || undefined });
          }
          await append("user", results);
        }
      } catch (err) {
        console.error("fiesta failed", err);
        send({
          t: "error",
          message:
            err instanceof Anthropic.RateLimitError
              ? "Fiesta is busy for a moment. Try again in a minute."
              : err instanceof Anthropic.APIError && (err.status ?? 0) >= 500
                ? "Fiesta could not reach Claude just now. Try again."
                : "Something went wrong. Try asking again.",
        });
      }
      send({ t: "done" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

/** Her conversations, newest first, for the list in the panel. */
export async function GET() {
  const session = await auth();
  const me = session?.user;
  if (me?.role !== "owner" || me.practiceOnly) return new Response("Fiesta is for owners.", { status: 401 });
  const list = await db
    .select({ id: fiestaConversations.id, title: fiestaConversations.title, updatedAt: fiestaConversations.updatedAt })
    .from(fiestaConversations)
    .where(eq(fiestaConversations.userId, me.id))
    .orderBy(desc(fiestaConversations.updatedAt))
    .limit(30);
  return Response.json(list);
}
