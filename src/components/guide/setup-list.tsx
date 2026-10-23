"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { switchMode } from "@/actions/practice";
import { reloadInto } from "@/components/practice/track";
import { Button } from "@/components/ui/button";
import type { SetupStep } from "@/lib/guide/setup";
import { cn } from "cn";
import { useGuide } from "./guide-provider";

/** Each setup step with what is still missing, and a Show me that walks her through it. */
export function SetupList({ steps, canLearn }: { steps: SetupStep[]; canLearn: boolean }) {
  const guide = useGuide();
  const [pending, start] = useTransition();
  const left = steps.filter((s) => !s.done).length;
  return (
    <>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("flex flex-col gap-3 rounded-[14px] border px-4 py-3.5 sm:flex-row sm:items-center", s.done ? "border-line bg-paper/60" : "border-line bg-surface")}>
            <span className={cn("tabular flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", s.done ? "bg-leaf text-white" : "border border-ink/30 text-ink")}>
              {s.done ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold", s.done && "text-ink-muted")}>{s.title}</p>
              <p className="text-[13px] text-ink-muted">{s.why}</p>
              {s.missing.length ? <p className={cn("mt-0.5 text-[13px]", s.done ? "text-ink-muted" : "font-semibold text-brand-deep")}>{s.done ? s.missing.join(". ") : `Still needed: ${s.missing.join(", ")}.`}</p> : null}
            </div>
            <div className="flex shrink-0 gap-2">
              {guide.available("setup", s.key) ? (
                <Button size="sm" variant={s.done ? "ghost" : "default"} className="h-10" onClick={() => guide.start("setup", s.key)}>
                  {s.done ? "Show me again" : "Show me"}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="h-10" nativeButton={false} render={<Link href={s.href} />}>
                Open
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-6 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="text-xl font-medium">Learn how it works</h2>
        <p className="mt-1 max-w-prose text-[14px] text-ink-muted">
          {left ? `${left} setup ${left === 1 ? "step is" : "steps are"} still open. You can learn first and finish them later. ` : "The shop is set up. "}
          Practice is a copy of your shop with made up orders. 13 missions, with the guide showing every tap.
        </p>
        {canLearn ? (
          <Button
            className="mt-4 h-11"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await switchMode("practice");
                if (res.ok) reloadInto("/today");
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Go to Practice
          </Button>
        ) : null}
      </section>
    </>
  );
}
