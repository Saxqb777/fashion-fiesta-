"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Loader2Icon, XIcon } from "lucide-react";
import { fillLinks, pathMatches, type GuideLinks, type GuideTour } from "@/lib/guide/types";
import { cn } from "cn";

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 6;
const RADIUS = 12;
/** Pop ups that open from a lit up control (lists, menus, date pickers) stay usable inside the lock. */
const POPUPS = "[data-guide-popup], [role=listbox], [role=menu], [data-side][data-open]";

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
}

function find(selector: string): HTMLElement | null {
  try {
    for (const el of document.querySelectorAll(selector)) if (el instanceof HTMLElement && visible(el)) return el;
  } catch {
    // A bad selector in a script must never break the page.
  }
  return null;
}

const toRect = (r: DOMRect, pad = PAD): Rect => ({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
const same = (a: Rect | null, b: Rect | null) => (!a || !b ? a === b : Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);

function roundRect({ x, y, w, h }: Rect) {
  const r = Math.min(RADIUS, w / 2, h / 2);
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
}

/** Types a value the way a person would, so React sees the change. */
function typeInto(el: HTMLElement, value: string) {
  if (el instanceof HTMLSelectElement) {
    const want = value.toLowerCase();
    const opt = [...el.options].find((o) => o.value === value) ?? [...el.options].find((o) => o.text.toLowerCase().includes(want));
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, opt.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    return true;
  }
  return false;
}

/** The field to fill or check: the lit up element itself, or the first field inside it. */
function fieldIn(el: HTMLElement | null): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el;
  return el.querySelector("input:not([type=hidden]), textarea, select");
}

/** **Bold** the words on the button she has to find. */
function Say({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i} className="font-bold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export type CoachResult = "finished" | "exit";

/**
 * The coach: dims the screen, lights up one thing, says what to do, and moves on by itself once she has
 * done it. Only the lit up thing can be tapped, so nobody gets lost; Exit is always there.
 * Mount it with a key per step, so every step starts clean.
 */
export function Coach({
  tour,
  links,
  step: index,
  onStep,
  onDone,
  missionDone,
}: {
  tour: GuideTour;
  links: GuideLinks;
  step: number;
  onStep: (next: number) => void;
  onDone: (result: CoachResult) => void;
  /** For mission tours: true once the server has ticked the mission. */
  missionDone?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const step = tour.steps[Math.min(index, tour.steps.length - 1)];
  const last = index >= tour.steps.length - 1;
  const onPath = !step.at || pathMatches(step.at, pathname, links);
  const selector = step.target ? fillLinks(step.target, links) : null;

  const [rect, setRect] = useState<Rect | null>(null);
  const [popups, setPopups] = useState<Rect[]>([]);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [missing, setMissing] = useState(false);
  const [loose, setLoose] = useState(false);
  const [filled, setFilled] = useState(false);
  const [phone, setPhone] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(180);
  const clickedAt = useRef<number | null>(null);
  const scrolledFor = useRef<number>(-1);
  const wentFor = useRef<number>(-1);

  const advance = useCallback(() => {
    if (last) onDone("finished");
    else onStep(index + 1);
  }, [index, last, onDone, onStep]);

  // Take her to the right page by herself, once per step.
  useEffect(() => {
    if (onPath || !step.go || wentFor.current === index) return;
    wentFor.current = index;
    router.push(fillLinks(step.go, links));
  }, [onPath, step.go, index, links, router]);

  // Follow the lit up element as the page moves, loads and scrolls.
  useEffect(() => {
    let raf = 0;
    let since = performance.now();
    const tick = () => {
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      setPhone(window.innerWidth < 768);
      const el = onPath && selector ? find(selector) : null;
      if (el) {
        since = performance.now();
        const r = toRect(el.getBoundingClientRect());
        setRect((old) => (same(old, r) ? old : r));
        setMissing(false);
        if (scrolledFor.current !== index) {
          scrolledFor.current = index;
          const b = el.getBoundingClientRect();
          if (b.top < 70 || b.bottom > window.innerHeight - 160) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        }
        const f = fieldIn(el);
        if (f) setFilled(Boolean(f.value.trim()));
      } else {
        setRect((old) => (old ? null : old));
        // Waiting too long for something that never shows: let her carry on by hand.
        if (onPath && selector && performance.now() - since > 3500) setMissing(true);
      }
      const ups = [...document.querySelectorAll(POPUPS)].filter(visible).map((p) => toRect(p.getBoundingClientRect(), 2));
      setPopups((old) => (old.length === ups.length && old.every((o, i) => same(o, ups[i])) ? old : ups));
      // A save that did not move on after a while usually means a red error to fix: unlock so she can.
      if (clickedAt.current && performance.now() - clickedAt.current > 2500) setLoose(true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPath, selector, index, reduce]);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBubbleH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Advancing on what she does.
  const adv = step.advance;
  useEffect(() => {
    if (!onPath) return;
    if (adv === "click" || (typeof adv === "object" && !("tap" in adv) && selector)) {
      const onClick = (e: MouseEvent) => {
        const el = selector ? find(selector) : null;
        if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
        if (adv === "click") setTimeout(advance, 60);
        // A save that should move to another page: if it has not after a while, unlock so she can fix the form.
        else if (typeof adv === "object" && "path" in adv) clickedAt.current = performance.now();
      };
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
    }
  }, [adv, onPath, selector, advance]);

  useEffect(() => {
    if (typeof adv !== "object") return;
    if ("path" in adv && pathMatches(adv.path, pathname, links)) advance();
  }, [adv, pathname, links, advance]);

  useEffect(() => {
    if (typeof adv !== "object" || !("tap" in adv) || !onPath) return;
    const sel = fillLinks(adv.tap, links);
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest(sel) : null;
      if (el) setTimeout(advance, 60);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [adv, links, onPath, advance]);

  useEffect(() => {
    if (typeof adv !== "object" || !("see" in adv)) return;
    const sel = fillLinks(adv.see, links);
    const id = setInterval(() => {
      if (find(sel)) advance();
    }, 250);
    return () => clearInterval(id);
  }, [adv, links, advance]);

  useEffect(() => {
    if (typeof adv !== "object" || !("gone" in adv)) return;
    const sel = fillLinks(adv.gone, links);
    let seen = false;
    const id = setInterval(() => {
      if (find(sel)) seen = true;
      else if (seen) advance();
    }, 250);
    return () => clearInterval(id);
  }, [adv, links, advance]);

  useEffect(() => {
    if (adv === "mission" && missionDone) advance();
  }, [adv, missionDone, advance]);

  const fill = () => {
    const el = selector ? fieldIn(find(selector)) : null;
    if (!el || !step.fill) return;
    const value = step.fill.startsWith("@") ? (el.getAttribute(step.fill.slice(1)) ?? "") : fillLinks(step.fill, links);
    if (value) typeInto(el, value);
  };

  const locked = onPath && Boolean(rect) && !loose && !missing;
  const holes = rect ? [rect, ...popups] : popups;
  const path = `M0 0H${view.w}V${view.h}H0Z ${holes.map(roundRect).join(" ")}`;

  // Where the bubble sits: next to the lit up thing on a laptop, docked top or bottom on a phone.
  const W = Math.min(360, view.w - 24);
  let pos: React.CSSProperties;
  if (phone || !rect) {
    const top = rect && rect.y + rect.h / 2 > view.h * 0.55;
    pos = phone
      ? top
        ? { left: 12, right: 12, top: "calc(12px + var(--ribbon, 0px))" }
        : { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))" }
      : { left: (view.w - W) / 2, top: Math.max(80, view.h / 2 - bubbleH / 2), width: W };
  } else {
    const below = rect.y + rect.h + 14 + bubbleH < view.h - 8;
    const above = rect.y - 14 - bubbleH > 8;
    const left = Math.max(12, Math.min(rect.x + rect.w / 2 - W / 2, view.w - W - 12));
    if (below || !above) {
      const top = below ? rect.y + rect.h + 14 : Math.max(12, view.h - bubbleH - 12);
      // Beside it when neither above nor below fits, so the bubble never sits on the thing to tap.
      if (!below && rect.x + rect.w + 14 + W < view.w) pos = { left: rect.x + rect.w + 14, top: Math.max(12, Math.min(rect.y, view.h - bubbleH - 12)), width: W };
      else if (!below && rect.x - 14 - W > 0) pos = { left: rect.x - 14 - W, top: Math.max(12, Math.min(rect.y, view.h - bubbleH - 12)), width: W };
      // A tall form fills the screen: sit in its lower left corner, away from the Save button on the right.
      else if (!below) pos = { left: Math.max(12, rect.x + 16), top, width: W };
      else pos = { left, top, width: W };
    } else pos = { left, top: rect.y - 14 - bubbleH, width: W };
  }

  const waiting = !onPath && !step.go;
  const field = step.advance === "filled";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-coach="" className="contents">
      {/* The dim. Holes cut by the clip path let taps through to the lit up thing only. */}
      {locked ? (
        <div
          aria-hidden
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={stop}
          className="fixed inset-0 z-[70] bg-[rgba(31,26,23,0.55)]"
          style={{ clipPath: `path(evenodd, "${path}")`, pointerEvents: "auto" }}
        />
      ) : null}
      {rect && onPath && !missing ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed z-[71] rounded-[12px] border-2 border-brand"
          initial={false}
          animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
        >
          {reduce ? null : (
            <motion.span
              className="absolute -inset-1 rounded-[14px] border-2 border-brand"
              animate={{ opacity: [0.7, 0], scale: [1, 1.08] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </motion.div>
      ) : null}

      <motion.div
        ref={bubbleRef}
        key={`${tour.key}-${index}`}
        role="dialog"
        aria-live="polite"
        aria-label={`${tour.title}, step ${index + 1} of ${tour.steps.length}`}
        onPointerDown={stop}
        onClick={stop}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed z-[72] rounded-[14px] border border-line bg-surface p-4 shadow-[0_18px_48px_-12px_rgba(31,26,23,0.35)]"
        style={{ ...pos, pointerEvents: "auto" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold tracking-wide text-ink-muted uppercase">{tour.title}</p>
            <div className="mt-1.5 flex gap-1" aria-hidden>
              {tour.steps.map((_, i) => (
                <span key={i} className={cn("h-1 w-4 rounded-full", i < index ? "bg-brand" : i === index ? "bg-ink" : "bg-line")} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => onDone("exit")} className="-mt-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-paper-deep" aria-label="Exit the guide">
            <XIcon className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-[16px] leading-snug text-ink">
          {waiting ? (
            <span className="inline-flex items-center gap-2 text-ink-muted">
              <Loader2Icon className="size-4 animate-spin" /> One moment.
            </span>
          ) : (
            <Say text={step.say} />
          )}
        </p>
        {loose && !missing ? <p className="mt-2 text-[13px] text-brand-deep">If something shows in red, fix it, then tap again.</p> : null}
        {missing ? <p className="mt-2 text-[13px] text-ink-muted">Cannot see it? Scroll a little, or skip this step.</p> : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {!onPath && step.go ? (
            <button type="button" onClick={() => router.push(fillLinks(step.go!, links))} className="h-11 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-deep">
              Take me there
            </button>
          ) : null}
          {step.file ? (
            <a href={`/api/practice/kit/${step.file}`} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-[14px] font-semibold hover:bg-paper-deep">
              Download it
            </a>
          ) : null}
          {onPath && step.fill && field ? (
            <button type="button" onClick={fill} className="h-11 rounded-[10px] border border-line bg-surface px-4 text-[14px] font-semibold hover:bg-paper-deep">
              Fill it for me
            </button>
          ) : null}
          {onPath && (step.advance === "next" || field) ? (
            <button
              type="button"
              disabled={field && !filled && !missing}
              onClick={advance}
              className="h-11 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              {last ? "Done" : "Next"}
            </button>
          ) : null}
          {step.advance === "mission" && !missionDone ? (
            <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
              <Loader2Icon className="size-4 animate-spin" /> Checking
            </span>
          ) : null}
          <span className="ml-auto text-[12px] tabular text-ink-muted">
            {index + 1} of {tour.steps.length}
          </span>
          {!last ? (
            <button type="button" onClick={advance} className="h-9 px-1 text-[13px] font-semibold text-ink-muted hover:text-ink">
              Skip step
            </button>
          ) : null}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
