"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { checkQuarter } from "@/actions/tax";
import { Button } from "@/components/ui/button";
import type { Review } from "@/lib/tax/review";
import { cn } from "cn";

const LEVEL = {
  fix: { word: "Fix", dot: "bg-brand" },
  check: { word: "Check", dot: "bg-sun" },
  fine: { word: "Fine", dot: "bg-leaf" },
} as const;

/** Idea 26: a plain list of what to fix before filing, one button each. Kept on the quarter until checked again. */
export function ReviewPanel({ periodStart, review, checkedLabel }: { periodStart: string; review: Review | null; checkedLabel: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await checkQuarter(periodStart);
      if (res.error) return void toast.error(res.error);
      router.refresh();
    });

  return (
    <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6" aria-labelledby="review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <h2 id="review-title" className="text-xl font-medium">
            Check this quarter
          </h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            {review ? review.summary : "Looks for missing TRNs, deliveries not invoiced, deposits, odd VAT, and big swings against the quarter before. Nothing is changed."}
          </p>
        </div>
        <Button type="button" variant={review ? "outline" : "default"} onClick={run} disabled={pending} data-track="tax-review">
          {pending ? "Checking" : review ? "Check again" : "Check this quarter"}
        </Button>
      </div>

      {review ? (
        <>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {review.items.map((i) => (
              <li key={i.key} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5 sm:flex-nowrap">
                <span className="mt-0.5 inline-flex w-14 shrink-0 items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink-muted uppercase">
                  <span aria-hidden className={cn("size-2 rounded-full", LEVEL[i.level].dot)} />
                  {LEVEL[i.level].word}
                </span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-semibold">{i.title}</p>
                  <p className="mt-0.5 text-[14px] text-ink-muted">{i.text}</p>
                </div>
                {i.action ? (
                  <Link href={i.action.href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold hover:bg-paper-deep">
                    {i.action.label}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {checkedLabel ? <p className="mt-3 text-[12px] text-ink-muted">Checked {checkedLabel}{review.ai ? ", written up by Fiesta" : ""}. Check again after you fix something.</p> : null}
        </>
      ) : null}
    </section>
  );
}
