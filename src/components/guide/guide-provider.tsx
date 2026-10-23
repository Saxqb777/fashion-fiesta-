"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { Button } from "@/components/ui/button";
import { markGuideSeen } from "@/actions/guide";
import { switchMode } from "@/actions/practice";
import { reloadInto } from "@/components/practice/track";
import { MISSION_TOURS, SETUP_ORDER, SETUP_TOURS, type SetupKey } from "@/lib/guide/tours";
import type { GuideLinks, GuideTour } from "@/lib/guide/types";
import type { MissionsState } from "@/lib/practice/missions-data";
import { Coach, type CoachResult } from "./coach";

export type GuideKind = "mission" | "setup";
type Active = { kind: GuideKind; key: string; step: number };
type Cheer = { title: string; line: string; next?: { label: string; run: () => void } };

const STORE = "ff-guide-active";
const AUTO = "ff-guide-auto";
/** Fired by the missions panel every time it learns where the missions stand. */
export const MISSIONS_EVENT = "ff-missions-state";

const CHANGED = "ff-guide-changed";
/** Kept in memory too, so the guide still runs on a phone that refuses storage. */
let memory: string | null = null;
const raw = () => {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return memory;
  }
};
const parse = (s: string | null): Active | null => {
  try {
    const v = JSON.parse(s ?? "null") as Active | null;
    return v && typeof v.key === "string" && typeof v.step === "number" ? v : null;
  } catch {
    return null;
  }
};
const write = (v: Active | null) => {
  memory = v ? JSON.stringify(v) : null;
  try {
    if (memory) localStorage.setItem(STORE, memory);
    else localStorage.removeItem(STORE);
  } catch {
    // Storage can be off in a private window. Memory carries it on this page.
  }
  window.dispatchEvent(new Event(CHANGED));
};
const subscribe = (fn: () => void) => {
  window.addEventListener(CHANGED, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener("storage", fn);
  };
};

type Ctx = { start: (kind: GuideKind, key: string) => void; active: Active | null; available: (kind: GuideKind, key: string) => boolean };
/** Into Practice, where the first mission starts by itself. */
async function goPractice() {
  const res = await switchMode("practice");
  if (res.ok) reloadInto("/today");
}

const GuideContext = createContext<Ctx>({ start: () => {}, active: null, available: () => false });
export const useGuide = () => useContext(GuideContext);

function tourFor(a: Active | null): GuideTour | null {
  if (!a) return null;
  return (a.kind === "mission" ? MISSION_TOURS[a.key] : SETUP_TOURS[a.key]) ?? null;
}

/**
 * Holds which guide is running and on which step, across page changes and reloads.
 * In Practice it starts the first mission by itself the first time, and after each mission
 * offers the next one. In Live it runs the setup steps.
 */
export function GuideProvider({
  links,
  mode,
  pendingSetup = [],
  welcome,
  children,
}: {
  links: GuideLinks;
  mode: "practice" | "live" | "off";
  /** Setup steps still open, in order. Live only. */
  pendingSetup?: string[];
  /** Show the getting started sheet: an owner in Live who has never seen it. */
  welcome?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const stored = useSyncExternalStore(subscribe, raw, () => null);
  const active = useMemo(() => parse(stored), [stored]);
  const [missions, setMissions] = useState<MissionsState | null>(null);
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const [hideWelcome, setHideWelcome] = useState(false);
  const autoTried = useRef(false);

  const set = useCallback((v: Active | null) => write(v), []);

  // A guide for the other shop never carries over: setup runs in Live, missions in Practice.
  const tour = active && ((active.kind === "mission" && mode === "practice") || (active.kind === "setup" && mode === "live")) ? tourFor(active) : null;

  const start = useCallback(
    (kind: GuideKind, key: string) => {
      setCheer(null);
      if (tourFor({ kind, key, step: 0 })) set({ kind, key, step: 0 });
    },
    [set],
  );

  useEffect(() => {
    const on = (e: Event) => setMissions((e as CustomEvent<MissionsState>).detail);
    window.addEventListener(MISSIONS_EVENT, on);
    return () => window.removeEventListener(MISSIONS_EVENT, on);
  }, []);

  // First time in Practice, nothing done yet: the first mission starts by itself.
  useEffect(() => {
    if (mode !== "practice" || !missions || autoTried.current) return;
    autoTried.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem(AUTO) === "1";
      localStorage.setItem(AUTO, "1");
    } catch {
      seen = true;
    }
    const untouched = missions.missions.every((m) => m.status === "open");
    if (!seen && untouched && !active) {
      const first = missions.missions[0];
      if (first && MISSION_TOURS[first.key]) set({ kind: "mission", key: first.key, step: 0 });
    }
  }, [mode, missions, active, set]);

  const missionDone = active?.kind === "mission" ? missions?.missions.find((m) => m.key === active.key)?.status === "done" : undefined;

  const finish = useCallback(
    (result: CoachResult) => {
      const was = active;
      set(null);
      if (result !== "finished" || !was) return;
      if (was.kind === "mission" && missions) {
        const list = missions.missions;
        const done = list.filter((m) => m.status === "done" || m.key === was.key).length;
        const next = list.find((m) => m.status === "open" && m.key !== was.key && MISSION_TOURS[m.key]);
        const title = list.find((m) => m.key === was.key)?.title ?? "Mission";
        setCheer({
          title: `${title}: done`,
          line: `${done} of ${list.length} missions.${next ? ` Next: ${next.title}.` : " That was the last one."}`,
          next: next ? { label: "Next mission", run: () => start("mission", next.key) } : undefined,
        });
      } else if (was.kind === "setup") {
        router.refresh();
        // The next open step after this one, then any open one before it.
        const after = SETUP_ORDER.slice(SETUP_ORDER.indexOf(was.key as SetupKey) + 1);
        const next = after.find((k) => pendingSetup.includes(k)) ?? pendingSetup.find((k) => k !== was.key) ?? null;
        setCheer({
          title: `${SETUP_TOURS[was.key]?.title ?? "Step"}: done`,
          line: next
            ? `Next: ${SETUP_TOURS[next].title}. Skipped steps wait in Settings, Setup.`
            : "That was the last setup step. Now learn how the shop runs, in Practice.",
          next: next ? { label: "Next step", run: () => start("setup", next) } : { label: "Learn how it works", run: () => void goPractice() },
        });
      }
    },
    [active, missions, pendingSetup, router, set, start],
  );

  const value = useMemo<Ctx>(
    () => ({ start, active: tour ? active : null, available: (kind, key) => Boolean(kind === "mission" ? MISSION_TOURS[key] : SETUP_TOURS[key]) }),
    [start, active, tour],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      {tour && active ? (
        <Coach
          key={`${active.kind}-${active.key}-${active.step}`}
          tour={tour}
          links={links}
          step={active.step}
          missionDone={missionDone}
          onStep={(n) => set({ ...active, step: n })}
          onDone={finish}
        />
      ) : null}
      <AnimatePresence>{cheer ? <CheerCard cheer={cheer} onClose={() => setCheer(null)} /> : null}</AnimatePresence>
      <AnimatePresence>
        {welcome && mode === "live" && !hideWelcome ? (
          <WelcomeSheet
            setupLeft={pendingSetup.length}
            onSetup={() => {
              setHideWelcome(true);
              void markGuideSeen();
              if (pendingSetup[0]) start("setup", pendingSetup[0]);
            }}
            onLearn={() => {
              setHideWelcome(true);
              void markGuideSeen().then(goPractice);
            }}
            onLater={() => {
              setHideWelcome(true);
              void markGuideSeen();
            }}
          />
        ) : null}
      </AnimatePresence>
    </GuideContext.Provider>
  );
}

/** Under a second of colour, then the next step. */
function CheerCard({ cheer, onClose }: { cheer: Cheer; onClose: () => void }) {
  const reduce = useReducedMotion();
  const colours = ["#00AEEF", "#FFD200", "#8DC63F", "#E6007E", "#D7182A"];
  return (
    <motion.div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-[rgba(31,26,23,0.35)] p-3 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheer-title"
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-[14px] border border-line bg-surface p-6 text-center"
        initial={reduce ? false : { y: 24, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
      >
        {reduce
          ? null
          : Array.from({ length: 18 }, (_, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute top-10 left-1/2 size-2 rounded-full"
                style={{ background: colours[i % colours.length] }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: Math.cos((i / 18) * Math.PI * 2) * (70 + (i % 3) * 30), y: Math.sin((i / 18) * Math.PI * 2) * (50 + (i % 4) * 18), opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            ))}
        <h2 id="cheer-title" className="font-display text-[1.6rem] leading-tight font-medium">
          {cheer.title}
        </h2>
        <SwooshStripe className="mx-auto mt-3 max-w-[56px]" />
        <p className="mt-3 text-[15px] text-ink-muted">{cheer.line}</p>
        <div className="mt-5 flex flex-col gap-2">
          {cheer.next ? (
            <Button size="lg" className="h-12" onClick={cheer.next.run} autoFocus>
              {cheer.next.label}
            </Button>
          ) : null}
          <Button size="lg" variant="ghost" className="h-12" onClick={onClose} autoFocus={!cheer.next}>
            {cheer.next ? "Take a break" : "Close"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Shown once to each owner in the real shop. Two parts, in order: set up the shop, then learn how it runs.
 * Setup can wait: anything skipped stays in Settings, Setup and on Today.
 */
function WelcomeSheet({ setupLeft, onSetup, onLearn, onLater }: { setupLeft: number; onSetup: () => void; onLearn: () => void; onLater: () => void }) {
  const reduce = useReducedMotion();
  const total = SETUP_ORDER.length;
  return (
    <motion.div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-[rgba(31,26,23,0.45)] p-3 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <motion.div
        className="w-full max-w-lg rounded-[14px] border border-line bg-surface p-6 sm:p-8"
        initial={reduce ? false : { y: 24 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
      >
        <h2 id="welcome-title" className="font-display text-[2rem] leading-[1.1] font-medium">
          Let&apos;s get the shop ready
        </h2>
        <SwooshStripe className="mt-3 max-w-[64px]" />
        <ol className="mt-6 flex flex-col gap-4">
          <li className="flex gap-3">
            <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-paper">1</span>
            <div>
              <p className="font-semibold">Set up your shop</p>
              <p className="text-[14px] text-ink-muted">
                {setupLeft ? `${setupLeft} of ${total} steps to fill in: bank, team, suppliers, products, customers, opening balances. ` : "All filled in. "}
                About 15 minutes. You can skip it and come back from Settings, Setup.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full border border-ink text-[14px] font-bold">2</span>
            <div>
              <p className="font-semibold">Learn how it works</p>
              <p className="text-[14px] text-ink-muted">13 short missions in Practice, a copy of your shop with made up orders. The guide shows every tap. Nothing touches the real shop.</p>
            </div>
          </li>
        </ol>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          {setupLeft ? (
            <Button size="lg" className="h-12 flex-1" onClick={onSetup} autoFocus>
              Start with setup
            </Button>
          ) : null}
          <Button size="lg" variant={setupLeft ? "outline" : "default"} className="h-12 flex-1" onClick={onLearn} autoFocus={!setupLeft}>
            {setupLeft ? "Skip setup, learn first" : "Learn how it works"}
          </Button>
        </div>
        <button type="button" onClick={onLater} className="mt-3 h-10 w-full text-[14px] font-semibold text-ink-muted hover:text-ink">
          Not now
        </button>
      </motion.div>
    </motion.div>
  );
}
