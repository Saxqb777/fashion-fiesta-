"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpIcon, CheckIcon, CopyIcon, HistoryIcon, Loader2Icon, MessageCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { confirmCard, loadConversation, type FiestaItem } from "@/actions/fiesta";
import { SWOOSH } from "@/components/brand/swoosh-stripe";
import { Button } from "@/components/ui/button";
import { formatFils } from "@/lib/money";
import type { Card } from "@/lib/fiesta/tools";
import { whatsappNumber } from "@/lib/phone";
import { cn } from "cn";

type Item = FiestaItem | { kind: "status"; label: string } | { kind: "error"; text: string };
type Convo = { id: string; title: string; updatedAt: string };

const STORE = "ff-fiesta-convo";
const remember = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(STORE, id);
    else sessionStorage.removeItem(STORE);
  } catch {
    // Storage can be blocked; Fiesta just starts a new chat.
  }
};
const recall = () => {
  try {
    return sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
};

const SUGGESTIONS = ["Who owes me the most?", "What needs me today?", "Which fabric is running low?", "Explain this screen"];

/** What she is looking at, so "explain this screen" has something to explain. */
function screen(pathname: string) {
  const main = document.querySelector("main");
  return { path: pathname, title: document.title.slice(0, 200), text: (main?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, 7000) };
}

/** Just enough formatting for her answers: paragraphs, lists, bold and links into the app. */
function Rich({ text }: { text: string }) {
  const inline = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]*\))/g).map((part, i) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={`${key}${i}`}>{bold[1]}</strong>;
      const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
      if (link)
        return (
          <Link key={`${key}${i}`} href={link[2]} className="font-semibold underline underline-offset-2">
            {link[1]}
          </Link>
        );
      return <Fragment key={`${key}${i}`}>{part}</Fragment>;
    });
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      i--;
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={i} className={cn("my-1.5 flex flex-col gap-1 pl-5", ordered ? "list-decimal" : "list-disc marker:text-ink-muted")}>
          {items.map((it, k) => (
            <li key={k}>{inline(it, `${i}-${k}-`)}</li>
          ))}
        </List>,
      );
    } else if (line.trim()) {
      const heading = line.match(/^#{1,4}\s+(.*)$/);
      blocks.push(
        <p key={i} className={cn("my-1", heading && "mt-3 font-semibold")}>
          {inline(heading ? heading[1] : line, `${i}-`)}
        </p>,
      );
    }
  }
  return <div className="text-[15px] leading-relaxed">{blocks}</div>;
}

const METHOD = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque" } as const;

function CardView({ id, card, confirmed, conversationId, onDone }: { id: string; card: Card; confirmed: boolean; conversationId: string | null; onDone: (id: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  if (card.kind === "message") {
    const phone = whatsappNumber(card.phone);
    return (
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <p className="text-[12px] font-bold tracking-wide text-ink-muted uppercase">
          {card.channel === "whatsapp" ? "WhatsApp" : card.channel === "email" ? "Email" : "Message"} to {card.toName}
        </p>
        <p className="mt-2 rounded-[10px] bg-paper px-3 py-2.5 text-[15px] whitespace-pre-line">{card.text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(card.text).then(() => toast.success("Copied."));
            }}
          >
            <CopyIcon />
            Copy
          </Button>
          {card.channel !== "email" ? (
            <Button size="sm" variant="outline" className="border-[#25D366]/40 text-[#128C4B]" nativeButton={false} render={<a href={`https://wa.me/${phone ?? ""}?text=${encodeURIComponent(card.text)}`} target="_blank" rel="noreferrer" />}>
              <MessageCircleIcon />
              Open WhatsApp
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const title =
    card.kind === "payment" ? "Record a payment" : card.kind === "assign" ? "Give this work to someone else" : card.kind === "draft" ? (card.mode === "order" ? "Save a draft order" : "Save a quote") : "Email a statement";
  const rows: [string, string][] =
    card.kind === "payment"
      ? [["From", card.customerName], ["Amount", formatFils(card.amount)], ["How", METHOD[card.method]], ...(card.invoiceNumber ? [["For", card.invoiceNumber] as [string, string]] : []), ...(card.reference ? [["Reference", card.reference] as [string, string]] : [])]
      : card.kind === "assign"
        ? [["Work", card.taskLabel], ["Give to", card.tailorName]]
        : card.kind === "draft"
          ? [["Customer", card.branchName ? `${card.customerName}, ${card.branchName}` : card.customerName], ...(card.customerPoNumber ? [["Customer PO", card.customerPoNumber] as [string, string]] : [])]
          : [["To", card.to || "Type the address in the email screen"], ["Subject", card.subject]];
  const total = card.kind === "draft" ? card.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) : 0;

  const confirm = () =>
    start(async () => {
      if (!conversationId) return;
      const res = await confirmCard({ conversationId, toolUseId: id, card });
      // A payment goes straight to its receipt; the redirect happens before this line.
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      onDone(id);
      if (res?.message) toast.success(res.message);
      if (res?.href) router.push(res.href);
    });

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4">
      <p className="font-display text-[1.05rem] font-medium">{title}</p>
      <dl className="mt-2 flex flex-col gap-1 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 text-ink-muted">{k}</dt>
            <dd className="min-w-0 font-semibold break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {card.kind === "draft" ? (
        <ul className="tabular mt-2 flex flex-col divide-y divide-line rounded-[10px] border border-line text-[13px]">
          {card.lines.map((l, i) => (
            <li key={i} className="flex gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1">{l.description}</span>
              <span className="text-ink-muted">{l.qty} x {formatFils(l.unitPrice, { currency: false })}</span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-1.5 font-semibold">
            <span>Before VAT</span>
            <span>{formatFils(total)}</span>
          </li>
        </ul>
      ) : null}
      {card.kind === "email" ? <p className="mt-2 rounded-[10px] bg-paper px-3 py-2 text-[13px] whitespace-pre-line">{card.body}</p> : null}
      {confirmed ? (
        <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-[#4d7a12]">
          <CheckIcon className="size-4" />
          Done
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-10 px-4" disabled={pending || (card.kind === "email" && !card.to)} onClick={confirm}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {card.kind === "email" ? "Send" : "Confirm"}
          </Button>
          <Button size="sm" variant="ghost" className="h-10" onClick={() => setHidden(true)}>
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}

/** Fiesta: a quiet button on every owner screen that opens a chat about the shop. */
export function Fiesta() {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Convo[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const scrollDown = () => requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));

  const openConversation = useCallback(async (id: string) => {
    const c = await loadConversation(id);
    if (!c) {
      remember(null);
      return;
    }
    setConversationId(id);
    setItems(c.items);
    remember(id);
    setHistory(null);
    scrollDown();
  }, []);

  const show = () => {
    setOpen(true);
    // Reopen the chat from earlier in this visit.
    const last = recall();
    if (!conversationId && last) void openConversation(last);
  };
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  const fresh = () => {
    setItems([]);
    setConversationId(null);
    remember(null);
    setHistory(null);
    input.current?.focus();
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    setHistory(null);
    setItems((xs) => [...xs, { kind: "user", text: q }, { kind: "status", label: "Thinking" }]);
    scrollDown();
    const settle = (fn: (xs: Item[]) => Item[]) => setItems((xs) => fn(xs.filter((x) => x.kind !== "status")));
    try {
      const res = await fetch("/api/fiesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: q, screen: screen(pathname) }),
      });
      if (!res.ok || !res.body) {
        settle((xs) => [...xs, { kind: "error", text: res.status === 503 ? "Fiesta is not connected yet." : "Fiesta could not answer just now. Try again." }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { t: string; d?: string; label?: string; id?: string; card?: Card; path?: string; message?: string; conversationId?: string };
          if (e.t === "start" && e.conversationId) {
            setConversationId(e.conversationId);
            remember(e.conversationId);
          } else if (e.t === "text" && e.d) {
            settle((xs) => {
              const last = xs[xs.length - 1];
              return last?.kind === "assistant" ? [...xs.slice(0, -1), { ...last, text: last.text + e.d }] : [...xs, { kind: "assistant", text: e.d! }];
            });
          } else if (e.t === "tool" && e.label) {
            settle((xs) => [...xs, { kind: "status", label: e.label! }]);
          } else if (e.t === "card" && e.id && e.card) {
            settle((xs) => [...xs, { kind: "card", id: e.id!, card: e.card, confirmed: false }]);
          } else if (e.t === "nav" && e.path) {
            settle((xs) => [...xs, { kind: "nav", path: e.path!, label: e.label ?? e.path! }]);
            router.push(e.path);
            // On a phone the chat covers the page, so step aside to show it.
            if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
          } else if (e.t === "error" && e.message) {
            settle((xs) => [...xs, { kind: "error", text: e.message! }]);
          }
          scrollDown();
        }
      }
    } catch {
      settle((xs) => [...xs, { kind: "error", text: "The connection dropped. Try again." }]);
    } finally {
      setItems((xs) => xs.filter((x) => x.kind !== "status"));
      setBusy(false);
    }
  };

  const showHistory = async () => {
    if (history) return setHistory(null);
    const res = await fetch("/api/fiesta");
    setHistory(res.ok ? ((await res.json()) as Convo[]) : []);
  };

  return (
    <>
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="fab"
            type="button"
            onClick={show}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            aria-label="Ask Fiesta"
            className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex h-12 items-center gap-2.5 rounded-full bg-ink pr-5 pl-4 text-paper shadow-[0_8px_24px_rgba(31,26,23,.22)] md:right-6 md:bottom-6"
          >
            <span aria-hidden className="grid grid-cols-2 gap-[3px]">
              {SWOOSH.map((c) => (
                <span key={c} className={cn("size-[5px] rounded-full", c)} />
              ))}
            </span>
            <span className="font-display text-[17px] font-medium tracking-wide">Fiesta</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.aside
            key="panel"
            aria-label="Fiesta"
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[55] flex flex-col bg-paper md:inset-auto md:top-[var(--ribbon,0px)] md:right-0 md:bottom-0 md:w-[420px] md:border-l md:border-line"
          >
            <header className="flex items-center gap-2 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.5rem] leading-none font-medium">Fiesta</p>
                <p className="mt-1 text-[12px] text-ink-muted">Reads the shop, prepares, never saves without your tap.</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Earlier chats" onClick={showHistory}>
                <HistoryIcon />
              </Button>
              <Button variant="ghost" size="icon" aria-label="New chat" onClick={fresh}>
                <PlusIcon />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Close Fiesta" onClick={() => setOpen(false)}>
                <XIcon />
              </Button>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
              {history ? (
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-ink-muted">Earlier chats</p>
                  {history.length ? (
                    <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
                      {history.map((h) => (
                        <li key={h.id}>
                          <button type="button" onClick={() => void openConversation(h.id)} className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-paper">
                            <span className="line-clamp-1 text-[14px] font-semibold">{h.title}</span>
                            <span className="text-[12px] text-ink-muted">{new Date(h.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[14px] text-ink-muted">No earlier chats yet.</p>
                  )}
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col justify-end gap-4 pb-2">
                  <p className="max-w-[30ch] font-display text-[1.6rem] leading-tight">What would you like to know about the shop?</p>
                  <p className="text-[14px] text-ink-muted">Ask about customers, money, the workshop or fabric. I can open pages, and prepare payments, drafts and messages for you to confirm.</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold hover:bg-paper-deep">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ol className="flex flex-col gap-3">
                  {items.map((it, i) => (
                    <li key={i} className={cn(it.kind === "user" && "flex justify-end")}>
                      {it.kind === "user" ? (
                        <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-paper-deep px-3.5 py-2 text-[15px] whitespace-pre-line">{it.text}</p>
                      ) : it.kind === "assistant" ? (
                        <Rich text={it.text} />
                      ) : it.kind === "card" ? (
                        <CardView
                          id={it.id}
                          card={it.card as Card}
                          confirmed={it.confirmed}
                          conversationId={conversationId}
                          onDone={(cid) => setItems((xs) => xs.map((x) => (x.kind === "card" && x.id === cid ? { ...x, confirmed: true } : x)))}
                        />
                      ) : it.kind === "nav" ? (
                        <Link href={it.path} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold hover:bg-paper-deep">
                          Opened {it.label}
                        </Link>
                      ) : it.kind === "status" ? (
                        <p className="flex items-center gap-2 text-[13px] text-ink-muted" role="status">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          {it.label}
                        </p>
                      ) : (
                        <p className="rounded-[10px] bg-brand-soft px-3 py-2 text-[14px] font-medium text-brand-deep">{it.text}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <form
              className="border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(text);
              }}
            >
              <div className="flex items-end gap-2 rounded-[14px] border border-line bg-paper px-3 py-2 focus-within:border-ink/40">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void ask(text);
                    }
                  }}
                  rows={1}
                  placeholder="Ask Fiesta"
                  aria-label="Ask Fiesta"
                  className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[16px] outline-none field-sizing-content"
                />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-30">
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ArrowUpIcon className="size-4" />}
                </button>
              </div>
            </form>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
