"use client";

import { useTransition } from "react";
import { switchMode } from "@/actions/practice";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { reloadInto } from "./track";

/** On every screen in Practice: a red band, so nobody mistakes the sandbox for the real shop. */
export function PracticeRibbon({ canLeave }: { canLeave: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="sticky top-0 z-50">
      <div className="flex h-9 items-center justify-between gap-3 bg-brand px-4 text-white md:px-6">
        <p className="min-w-0 truncate text-[13px]">
          <span className="mr-2 font-display text-[15px] font-semibold tracking-wide">Practice</span>
          <span className="opacity-90">Nothing here touches the real shop.</span>
        </p>
        {canLeave ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await switchMode("live");
                if (res.ok) reloadInto("/today");
              })
            }
            className="h-7 shrink-0 rounded-full bg-white px-3 text-[12px] font-bold text-brand-deep hover:bg-white/90"
          >
            {pending ? "Going live" : "Back to Live"}
          </button>
        ) : null}
      </div>
      <SwooshStripe height={3} className="w-full" />
    </div>
  );
}
