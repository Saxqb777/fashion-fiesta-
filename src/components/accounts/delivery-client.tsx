"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, FileTextIcon, Loader2Icon, TruckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { createDeliveryRun, deliveryPieces, markDelivered, removePendingDeliveryNote, tickPiece } from "@/actions/accounts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Piece } from "@/lib/accounts";
import { formatISODate } from "@/lib/dates";
import { EMIRATES } from "@/lib/emirates";
import { cn } from "cn";

type WaitingOrder = { id: string; label: string; date: string; pieces: number; emirates: string[] };
const select = "h-11 rounded-[10px] border border-line bg-surface px-3 text-base";

export function PlanRunButton({
  customerId,
  orders,
  companies,
  today,
  emirate: startEmirate = "",
  preselect,
  compact,
}: {
  customerId: string;
  orders: WaitingOrder[];
  companies: { id: string; name: string }[];
  today: string;
  emirate?: string;
  preselect?: string[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [emirate, setEmirate] = useState(startEmirate);
  const [company, setCompany] = useState(companies.length === 1 ? companies[0].id : "");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<string[]>(preselect ?? orders.map((o) => o.id));
  const [pending, start] = useTransition();
  const shown = orders.filter((o) => !emirate || o.emirates.includes(emirate));

  return (
    <>
      <Button variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"} onClick={() => setOpen(true)}>
        <TruckIcon />
        Plan a run
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Plan a delivery run</DialogTitle>
            <DialogDescription>Each branch gets its own delivery note, pending until you mark it delivered.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="runEmirate">Emirate</Label>
                <select id="runEmirate" value={emirate} onChange={(e) => setEmirate(e.target.value)} className={select}>
                  <option value="">All emirates</option>
                  {EMIRATES.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="runDate">Date</Label>
                <Input id="runDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="runCompany">Delivery company</Label>
              <select id="runCompany" value={company} onChange={(e) => setCompany(e.target.value)} className={select}>
                <option value="">{companies.length ? "Not set" : "None added yet"}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {companies.length ? null : (
                <p className="text-[12px] text-ink-muted">
                  Add one under{" "}
                  <Link href="/purchases/suppliers/new" className="font-semibold text-ink underline">
                    Purchases, Suppliers
                  </Link>{" "}
                  with &quot;Delivers for you&quot;.
                </p>
              )}
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold">Orders on this run</legend>
              {shown.length ? (
                shown.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.includes(o.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                      className="size-5 accent-[#D7182A]"
                    />
                    <span className="flex-1 text-[15px] font-semibold">{o.label}</span>
                    <span className="tabular text-[13px] text-ink-muted">{o.pieces} pieces waiting</span>
                  </label>
                ))
              ) : (
                <p className="text-[14px] text-ink-muted">Nothing is waiting for branches in {emirate}.</p>
              )}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="runNotes">Note for the driver</Label>
              <Textarea id="runNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={pending || !shown.some((o) => picked.includes(o.id))}
                onClick={() =>
                  start(async () => {
                    const res = await createDeliveryRun({ customerId, date, emirate, deliverySupplierId: company, notes, orderIds: picked.filter((id) => shown.some((o) => o.id === id)) });
                    if (res.error) return void toast.error(res.error);
                    toast.success(`${res.count} delivery ${res.count === 1 ? "note" : "notes"} ready to print.`);
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                Make the delivery notes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Note = { id: string; number: string; branchName: string; orderLabel: string; pieces: number; status: "pending" | "delivered"; receivedBy: string | null; deliveredOn: string | null };

export function DeliveryNoteRow({ note, today }: { note: Note; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [receivedBy, setReceivedBy] = useState("");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();

  const openDialog = () => {
    setOpen(true);
    if (!pieces)
      deliveryPieces(note.id).then((r) => {
        setPieces(r.pieces);
        setTicked(new Set(r.ticked));
      });
  };
  const toggle = (key: string, on: boolean) => {
    setTicked((t) => {
      const next = new Set(t);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    tickPiece({ deliveryNoteId: note.id, pieceKey: key, on }).then((r) => r.error && toast.error(r.error));
  };
  const delivered = note.status === "delivered";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{note.branchName}</p>
        <p className="tabular text-[13px] text-ink-muted">
          {note.number} · {note.orderLabel} · {note.pieces} pieces
        </p>
      </div>
      {delivered ? (
        <p className="text-[13px] text-[#4d7a12]">
          <CheckIcon className="mr-1 inline size-4" />
          Delivered {note.deliveredOn ? formatISODate(note.deliveredOn) : ""}
          {note.receivedBy ? `, received by ${note.receivedBy}` : ""}
        </p>
      ) : (
        <span className="inline-flex h-6 items-center rounded-full border border-sun/60 bg-sun/20 px-2.5 text-[11px] font-bold tracking-wide text-ink uppercase">Pending</span>
      )}
      <div className="flex items-center gap-1">
        <Button nativeButton={false} variant="ghost" size="sm" render={<a href={`/api/pdf/delivery/${note.id}`} target="_blank" rel="noreferrer" />}>
          <FileTextIcon />
          PDF
        </Button>
        {delivered ? null : (
          <>
            <Button size="sm" variant="outline" onClick={openDialog}>
              <CheckIcon />
              Delivered
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Take ${note.number} off the run`}
              title="Take off the run"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  if (!window.confirm(`Take ${note.number} for ${note.branchName} off the run? Its pieces go back to waiting.`)) return;
                  const res = await removePendingDeliveryNote(note.id);
                  if (res.error) return void toast.error(res.error);
                  router.refresh();
                })
              }
            >
              {removing ? <Loader2Icon className="animate-spin" /> : <XIcon className="text-ink-muted" />}
            </Button>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{note.branchName} delivered</DialogTitle>
            <DialogDescription>Tick the labels as the pieces are handed over. Anything left unticked is ticked when you save.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {pieces === null ? (
              <p className="flex items-center gap-2 text-[14px] text-ink-muted">
                <Loader2Icon className="size-4 animate-spin" />
                Loading the pieces
              </p>
            ) : (
              <div>
                <p className="tabular mb-2 text-[13px] font-semibold">
                  {ticked.size} of {pieces.length} ticked
                </p>
                <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                  {pieces.map((p) => (
                    <li key={p.key}>
                      <label className={cn("flex items-center gap-3 rounded-[10px] border px-3 py-2", ticked.has(p.key) ? "border-leaf/50 bg-leaf/10" : "border-line")}>
                        <input type="checkbox" checked={ticked.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} className="size-5 accent-[#D7182A]" />
                        <span className="min-w-0 flex-1 text-[14px]">
                          <span className="font-semibold">{p.description}</span>
                          {p.person || p.size ? <span className="text-ink-muted"> · {[p.person, p.size].filter(Boolean).join(", ")}</span> : null}
                        </span>
                        <span className="tabular text-[12px] text-ink-muted">
                          {p.n}/{p.of}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-${note.id}`}>Received by</Label>
                <Input id={`rb-${note.id}`} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name at the branch" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rd-${note.id}`}>Date</Label>
                <Input id={`rd-${note.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={pending || !receivedBy.trim()}
                onClick={() =>
                  start(async () => {
                    const res = await markDelivered({ deliveryNoteId: note.id, receivedBy, date });
                    if (res.error) return void toast.error(res.error);
                    toast.success(`${note.branchName} delivered.`);
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                Mark delivered
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
