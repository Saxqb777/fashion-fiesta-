"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon, ChevronDownIcon, DownloadIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { missionState, recordPracticeEvent, reopenMission, resetPractice, skipMission, switchMode } from "@/actions/practice";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { Button } from "@/components/ui/button";
import { SAMPLE_FILES, type MissionsState, type MissionView } from "@/lib/practice/missions-data";
import { cn } from "cn";
import { reloadInto } from "./track";

type Variant = "sidebar" | "float";
const STORE = (v: Variant) => `ff-missions-${v}`;
type Local = { open: boolean; chosen: string | null };
const readLocal = (v: Variant): Local => {
  // On a phone the card starts folded so it never sits on a button; in the sidebar it has room.
  const fallback = { open: v === "sidebar", chosen: null };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORE(v)) ?? "{}") };
  } catch {
    return fallback;
  }
};
const writeLocal = (variant: Variant, v: Local) => {
  try {
    localStorage.setItem(STORE(variant), JSON.stringify(v));
  } catch {
    // Private windows can refuse storage. The panel still works, it just forgets.
  }
};

/** The seam: one stitch per mission. Sewn stitches are done, the outlined one is where she is. */
function Seam({ missions, current, fresh }: { missions: MissionView[]; current?: string; fresh: string | null }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-[5px]" role="img" aria-label={`${missions.filter((m) => m.status === "done").length} of ${missions.length} missions done`}>
      {missions.map((m) => (
        <span key={m.key} className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-line">
          {m.status === "done" ? (
            <motion.span
              className="absolute inset-0 rounded-full bg-brand"
              initial={fresh === m.key && !reduce ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              style={{ originX: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          ) : m.status === "skipped" ? (
            <span className="absolute inset-0 rounded-full bg-ink-muted/30" />
          ) : m.key === current ? (
            <span className="absolute inset-0 rounded-full border-[1.5px] border-brand bg-surface" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

/**
 * One panel, in the right place for the screen: inside the sidebar on a laptop, where it never covers
 * the page, and as a small card above the bottom bar on a phone.
 */
export function MissionsMount({ owner }: { owner: boolean }) {
  const [variant, setVariant] = useState<Variant | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const set = () => setVariant(mq.matches ? "sidebar" : "float");
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  if (!variant) return null;
  const panel = <MissionsPanel key={variant} owner={owner} variant={variant} />;
  if (variant === "float") return panel;
  const slot = typeof document !== "undefined" ? document.getElementById("missions-slot") : null;
  return slot ? createPortal(panel, slot) : null;
}

function MissionsPanel({ owner, variant }: { owner: boolean; variant: Variant }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<MissionsState | null>(null);
  const [local, setLocal] = useState<Local>(() => readLocal(variant));
  const [showAll, setShowAll] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prev = useRef<Map<string, string> | null>(null);

  const saveLocal = (v: Partial<Local>) =>
    setLocal((l) => {
      const n = { ...l, ...v };
      writeLocal(variant, n);
      return n;
    });

  const apply = useCallback((s: MissionsState | null) => {
    if (!s) return;
    const before = prev.current;
    if (before) {
      const newly = s.missions.find((m) => m.status === "done" && before.get(m.key) !== "done");
      if (newly) {
        setFresh(newly.key);
        toast.success(`Done: ${newly.title}`);
      }
    }
    prev.current = new Map(s.missions.map((m) => [m.key, m.status]));
    setState(s);
  }, []);

  const check = useCallback(() => {
    void missionState().then(apply);
  }, [apply]);

  // Every page she opens counts for missions that ask her to look at something, then the checks run.
  useEffect(() => {
    const id = setTimeout(() => {
      void recordPracticeEvent("view", pathname).then(check);
    }, 400);
    return () => clearTimeout(id);
  }, [pathname, check]);
  // Taps the data cannot show: anything marked data-track, like Send on WhatsApp or a PDF.
  // Any other tap may have saved something, so look again shortly after, once the save has landed.
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      if (el instanceof HTMLElement) void recordPracticeEvent(el.dataset.track ?? "", el.dataset.trackRef ?? null).then(check);
      if (!(e.target as Element | null)?.closest?.("button, a, [role=button]")) return;
      timers.forEach(clearTimeout);
      timers = [setTimeout(check, 1500), setTimeout(check, 4000)];
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      timers.forEach(clearTimeout);
    };
  }, [check]);
  useEffect(() => {
    const on = () => check();
    window.addEventListener("ff-mission-check", on);
    window.addEventListener("focus", on);
    return () => {
      window.removeEventListener("ff-mission-check", on);
      window.removeEventListener("focus", on);
    };
  }, [check]);

  const missions = state?.missions ?? [];
  const firstDone = missions[0]?.status !== "open";
  const chosen = firstDone ? missions.find((m) => m.key === local.chosen && m.status === "open") : undefined;
  const current = chosen ?? missions.find((m) => m.status === "open");
  const doneCount = missions.filter((m) => m.status === "done").length;

  // The button to tap glows softly, wherever it is on the page.
  const targets = useMemo(() => current?.targets ?? [], [current]);
  useEffect(() => {
    if (!targets.length) return;
    const selector = targets.map((t) => `[data-mission~="${t}"]`).join(",");
    let raf = 0;
    const paint = () => {
      document.querySelectorAll(".mission-glow").forEach((el) => {
        if (!el.matches(selector)) el.classList.remove("mission-glow");
      });
      document.querySelectorAll(selector).forEach((el) => el.classList.add("mission-glow"));
    };
    paint();
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
      document.querySelectorAll(".mission-glow").forEach((el) => el.classList.remove("mission-glow"));
    };
  }, [targets, pathname]);

  if (!state) return null;

  const finishOpen = state.finished && !state.finishSeen;
  const position = variant === "float" ? "fixed z-40 left-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]" : "";

  return (
    <>
      <AnimatePresence>{finishOpen ? <FinishScreen owner={owner} missions={missions} onStay={() => start(async () => apply(await skipMission("finish-seen")))} /> : null}</AnimatePresence>

      {!local.open ? (
        <button
          type="button"
          onClick={() => saveLocal({ open: true })}
          className={cn(position, "flex h-11 items-center gap-2.5 rounded-full border border-line bg-surface pr-4 pl-3 text-[14px] font-semibold", variant === "float" ? "shadow-[0_6px_20px_rgba(31,26,23,.10)]" : "w-full")}
          aria-label="Open missions"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white tabular">{doneCount}</span>
          Missions <span className="tabular font-medium text-ink-muted">{doneCount} of {missions.length}</span>
        </button>
      ) : (
        <section
          aria-label="Missions"
          className={cn(
            position,
            "overflow-hidden rounded-[14px] border border-line bg-surface",
            variant === "float" ? "max-h-[70dvh] w-[min(360px,calc(100vw-24px))] overflow-y-auto shadow-[0_10px_34px_rgba(31,26,23,.14)]" : "w-full",
          )}
        >
          <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
            <p className="text-[13px] font-semibold text-ink-muted">
              Missions <span className="tabular ml-1 text-ink">{doneCount} of {missions.length}</span>
            </p>
            <button type="button" onClick={() => saveLocal({ open: false })} aria-label="Fold the missions away" className="-mr-1.5 flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-paper-deep">
              <ChevronDownIcon className="size-4" />
            </button>
          </header>
          <div className="px-4 pt-2.5">
            <Seam missions={missions} current={current?.key} fresh={fresh} />
          </div>

          {current ? (
            <div className="px-4 pt-4 pb-4">
              <h2 className={cn("font-display leading-tight font-medium", variant === "sidebar" ? "text-[1.125rem]" : "text-[1.375rem]")}>{current.title}</h2>
              <p className={cn("mt-1.5 leading-snug text-ink", variant === "sidebar" ? "text-[13px]" : "text-[14px]")}>{current.text}</p>
              {current.file ? (
                <a href={`/api/practice/kit/${current.file}`} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-deep underline underline-offset-2">
                  <DownloadIcon className="size-3.5" />
                  {SAMPLE_FILES.find((f) => f.file === current.file)?.label}
                </a>
              ) : null}
              <div className="mt-3.5 flex items-center gap-2">
                <Button size="sm" onClick={() => router.push(current.href)} className="h-10 px-4">
                  Take me there
                </Button>
                {firstDone || current.key !== missions[0]?.key ? (
                  <Button size="sm" variant="ghost" className="h-10" disabled={pending} onClick={() => start(async () => apply(await skipMission(current.key)))}>
                    Skip
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="px-4 pt-4 pb-4">
              <h2 className="font-display text-[1.375rem] leading-tight font-medium">All done</h2>
              <p className="mt-1.5 text-[14px] text-ink-muted">Keep practising as long as you like, or reset and start again.</p>
            </div>
          )}

          <div className="border-t border-line">
            <button type="button" onClick={() => setShowAll((v) => !v)} className="flex h-11 w-full items-center justify-between px-4 text-[13px] font-semibold text-ink-muted hover:text-ink" aria-expanded={showAll}>
              {showAll ? "Hide the list" : "All missions"}
              <ChevronDownIcon className={cn("size-4 transition-transform", showAll && "rotate-180")} />
            </button>
            {showAll ? (
              <div className="max-h-[38vh] overflow-y-auto px-2 pb-2">
                <ol className="flex flex-col">
                  {missions.map((m, i) => (
                    <li key={m.key}>
                      <button
                        type="button"
                        disabled={m.status === "done" || (!firstDone && i > 0)}
                        onClick={() => {
                          if (m.status === "skipped") start(async () => apply(await reopenMission(m.key)));
                          saveLocal({ chosen: m.key });
                          setShowAll(false);
                        }}
                        className={cn("flex min-h-10 w-full items-center gap-3 rounded-[10px] px-2 text-left text-[14px]", m.key === current?.key ? "bg-paper" : "hover:bg-paper", m.status === "done" && "text-ink-muted")}
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular", m.status === "done" ? "border-brand bg-brand text-white" : "border-line text-ink-muted")}>
                          {m.status === "done" ? <CheckIcon className="size-3" /> : i + 1}
                        </span>
                        <span className={cn("flex-1", m.status === "done" && "line-through decoration-line")}>{m.title}</span>
                        {m.status === "skipped" ? <span className="text-[11px] font-semibold text-ink-muted">Skipped</span> : null}
                      </button>
                    </li>
                  ))}
                </ol>
                {owner ? <OwnerExtras login={state.login} /> : null}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}

function OwnerExtras({ login }: { login?: { email: string; password: string } }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line px-2 pt-3">
      <div>
        <p className="text-[12px] font-bold tracking-wide text-ink-muted uppercase">Sample files</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {SAMPLE_FILES.map((f) => (
            <li key={f.file}>
              <a href={`/api/practice/kit/${f.file}`} className="flex items-baseline justify-between gap-2 text-[14px] font-semibold hover:underline">
                {f.label}
                <span className="text-[12px] font-medium text-ink-muted">{f.note}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      {login ? (
        <p className="text-[13px] text-ink-muted">
          For a tailor to practise on a phone: <span className="font-semibold text-ink">{login.email}</span>, password <span className="font-semibold text-ink">{login.password}</span>.
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Start Practice again from scratch? Everything done in Practice is wiped and the missions start over.")) return;
          start(async () => {
            const res = await resetPractice();
            if (res.error) toast.error(res.error);
            else reloadInto("/today");
          });
        }}
        className="flex h-10 items-center gap-2 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcwIcon className="size-4" />}
        {pending ? "Rebuilding Practice" : "Reset practice"}
      </button>
    </div>
  );
}

function FinishScreen({ owner, missions, onStay }: { owner: boolean; missions: MissionView[]; onStay: () => void }) {
  const [pending, start] = useTransition();
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-paper/95 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-title"
    >
      <div className="w-full max-w-xl text-center">
        <motion.div initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ originX: 0 }} className="mx-auto mb-8 max-w-sm">
          <Seam missions={missions} fresh={null} />
        </motion.div>
        <h2 id="finish-title" className="font-display text-[2.25rem] leading-[1.1] font-medium sm:text-[3rem]">
          {owner ? "You have run the shop for a month in 20 minutes." : "That is the whole job on the phone."}
        </h2>
        <p className="mt-4 text-[17px] text-ink-muted">{owner ? "Ready for real?" : "Sign out, then sign in with your own login for real work."}</p>
        <SwooshStripe className="mx-auto mt-6 max-w-[72px]" />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {owner ? (
            <Button
              size="lg"
              className="h-12 px-6"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await switchMode("live");
                  if (res.ok) reloadInto("/today");
                })
              }
            >
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              Go Live
            </Button>
          ) : null}
          <Button size="lg" variant="outline" className="h-12 px-6" onClick={onStay}>
            {owner ? "Stay in Practice" : "Keep practising"}
          </Button>
        </div>
        {owner ? (
          <p className="mt-6 text-[13px] text-ink-muted">
            The real shop starts empty and clean. The handover notes are in <Link href="/settings/help" className="font-semibold text-ink underline underline-offset-2" onClick={onStay}>Settings, Help</Link>.
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
