"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendStatements } from "@/actions/email";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFils } from "@/lib/money";
import { cn } from "cn";

type Row = { id: string; name: string; email: string | null; owed: number; late: number };

/** Due reminders: a statement to each ticked customer, one email each. Late payers are ticked first. */
export function EmailStatements({ rows, ready }: { rows: Row[]; ready: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.email && r.late > 0).map((r) => r.id)));
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const send = () =>
    start(async () => {
      const res = await sendStatements([...picked]);
      setFailed(res.failed);
      if (res.sent) toast.success(`${res.sent} ${res.sent === 1 ? "statement" : "statements"} sent`);
      if (!res.failed.length) setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MailIcon />
        Email statements
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email statements</DialogTitle>
            <DialogDescription>Each customer gets their statement for the last 90 days with a polite note on what is due. Replies come to you.</DialogDescription>
          </DialogHeader>
          {ready ? (
            <>
              <ul className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
                {rows.map((r) => (
                  <li key={r.id}>
                    <label className={cn("flex min-h-12 items-center gap-3 px-3 py-2", !r.email && "opacity-60")}>
                      <input type="checkbox" className="size-5 accent-[#D7182A]" checked={picked.has(r.id)} disabled={!r.email} onChange={() => toggle(r.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{r.name}</span>
                        <span className="block truncate text-[12px] text-ink-muted">{r.email ?? "No email saved"}</span>
                      </span>
                      <span className="tabular text-right text-[13px]">
                        {formatFils(r.owed)}
                        {r.late > 0 ? <span className="block text-[11px] font-semibold text-brand-deep">{formatFils(r.late)} late</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {failed.length ? (
                <ul className="rounded-[10px] bg-brand-soft px-3.5 py-2.5 text-sm text-brand-deep">
                  {failed.map((f) => (
                    <li key={f.name}>
                      <span className="font-semibold">{f.name}:</span> {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={send} disabled={pending || picked.size === 0}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
                  {pending ? "Sending" : `Send ${picked.size || ""}`.trim()}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[15px]">Email is not connected yet. Once the shop&apos;s email records are added to the domain, statements go from here.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
