"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendDocEmail } from "@/actions/email";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MailProps } from "@/lib/doc-links";
import { cn } from "cn";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(new Date(iso));

/** A ready email with the PDF attached. She checks the address and words, then taps Send. */
export function EmailDoc({ mail, size = "sm" }: { mail: MailProps; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(mail.to);
  const [subject, setSubject] = useState(mail.subject);
  const [body, setBody] = useState(mail.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const last = mail.history.find((h) => h.status === "sent");

  const openWith = (address?: string) => {
    setTo(address ?? mail.to);
    setSubject(mail.subject);
    setBody(mail.body);
    setError(null);
    setOpen(true);
  };
  const send = () =>
    start(async () => {
      setError(null);
      const res = await sendDocEmail({ type: mail.type, id: mail.id, query: mail.query, to, subject, body });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(`Sent to ${to}`);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button variant="outline" size={size} onClick={() => openWith()}>
        <MailIcon />
        Send by email
      </Button>
      {last ? (
        <span className="self-center text-[12px] text-ink-muted">
          Emailed {when(last.at)}
          <button type="button" onClick={() => openWith(last.to)} className="ml-1.5 font-semibold text-ink underline underline-offset-2">
            Resend
          </button>
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send by email</DialogTitle>
            <DialogDescription>The PDF goes as an attachment. Replies come back to your own email.</DialogDescription>
          </DialogHeader>
          {mail.ready ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`to-${mail.id}`}>To</Label>
                <Input id={`to-${mail.id}`} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts@customer.ae" autoComplete="off" />
                {!mail.to ? <p className="text-[12px] text-ink-muted">No email saved on this record. Type one, and add it to the record for next time.</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`subject-${mail.id}`}>Subject</Label>
                <Input id={`subject-${mail.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`body-${mail.id}`}>Message</Label>
                <Textarea id={`body-${mail.id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={9} />
              </div>
              {error ? <p className="rounded-[10px] bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand-deep">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={send} disabled={pending || !to.trim()}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
                  {pending ? "Sending" : "Send"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[15px]">Email is not connected yet. Once the shop&apos;s email records are added to the domain, this button sends straight away.</p>
          )}
          {mail.history.length ? (
            <div className="mt-2 border-t border-line pt-3">
              <p className="text-[13px] font-semibold text-ink-muted">Sent before</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
                {mail.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn("font-semibold", h.status !== "sent" && "text-brand-deep")}>{h.status === "sent" ? "Sent" : "Failed"}</span>
                    <span>to {h.to}</span>
                    <span className="text-ink-muted">
                      {when(h.at)}
                      {h.by ? ` by ${h.by}` : ""}
                    </span>
                    {h.status === "sent" ? (
                      <button type="button" onClick={() => openWith(h.to)} className="font-semibold underline underline-offset-2">
                        Resend
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
