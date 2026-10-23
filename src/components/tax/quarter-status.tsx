"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTaxStatus } from "@/actions/tax";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatISODate } from "@/lib/dates";
import { cn } from "cn";

export type QuarterStatus = "not_started" | "pack_ready" | "filed";

export function StatusPill({ status, filedOn, className }: { status: QuarterStatus; filedOn?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold whitespace-nowrap",
        status === "filed" ? "border-leaf/50 bg-leaf/15" : status === "pack_ready" ? "border-sun/70 bg-sun/20" : "border-line bg-paper-deep text-ink-muted",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", status === "filed" ? "bg-leaf" : status === "pack_ready" ? "bg-sun" : "border border-ink-muted/50")} />
      {status === "filed" ? `Filed${filedOn ? ` on ${formatISODate(filedOn, true)}` : ""}` : status === "pack_ready" ? "Pack ready" : "Not started"}
    </span>
  );
}

/** Where this quarter is, and the one next step. Not started is automatic; the other two are her taps. */
export function QuarterStatusControl({
  periodStart,
  label,
  status,
  filedOn,
  reference,
  running,
  today,
}: {
  periodStart: string;
  label: string;
  status: QuarterStatus;
  filedOn: string | null;
  reference: string | null;
  running: boolean;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(filedOn ?? today);
  const [ref, setRef] = useState(reference ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = (next: QuarterStatus, extra?: { filedOn: string; reference: string }) =>
    start(async () => {
      const res = await setTaxStatus({ periodStart, status: next, filedOn: extra?.filedOn ?? null, reference: extra?.reference ?? null });
      if (res.error) {
        setError(res.error);
        if (!open) toast.error(res.error);
        return;
      }
      setOpen(false);
      setError(null);
      toast.success(next === "filed" ? `${label} marked as filed.` : next === "pack_ready" ? "Pack ready. File it on EmaraTax next." : "Back to not started.");
      router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <StatusPill status={status} filedOn={filedOn} />
      {status === "filed" && reference ? <p className="text-[13px] text-ink-muted">EmaraTax reference {reference}</p> : null}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {status === "not_started" ? (
          <Button type="button" variant="outline" disabled={pending || running} onClick={() => save("pack_ready")} title={running ? "The quarter is still running." : undefined}>
            Mark pack ready
          </Button>
        ) : null}
        {status !== "filed" ? (
          <Button type="button" disabled={pending || running} onClick={() => setOpen(true)} data-track="tax-filed">
            Mark as filed
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
            Edit filing
          </Button>
        )}
        {status !== "not_started" ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => save(status === "filed" ? "pack_ready" : "not_started")}>
            Undo
          </Button>
        ) : null}
      </div>
      {running ? <p className="text-[12px] text-ink-muted sm:text-right">You can file once the quarter has ended.</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filed on EmaraTax</DialogTitle>
            <DialogDescription>{label}. The date you submitted, and the reference number EmaraTax showed.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save("filed", { filedOn: date, reference: ref });
            }}
          >
            {error ? <p className="text-[14px] font-semibold text-brand-deep">{error}</p> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filed-on">Date filed</Label>
              <Input id="filed-on" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filed-ref">EmaraTax reference</Label>
              <Input id="filed-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="From the confirmation screen" maxLength={80} />
            </div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving" : "Mark as filed"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
