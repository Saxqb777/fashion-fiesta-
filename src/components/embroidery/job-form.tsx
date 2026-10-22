"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileUpIcon, Loader2Icon, XIcon } from "lucide-react";
import { getCustomerContext, type CustomerOption } from "@/actions/documents";
import { customerDesigns, saveEmbroideryJob } from "@/actions/embroidery";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { CustomerPicker } from "@/components/orders/customer-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EmbroideryJob } from "@/db/schema";
import { formatISODate } from "@/lib/dates";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { cn } from "cn";

type Designs = Awaited<ReturnType<typeof customerDesigns>>;

export function JobForm({
  job,
  customer: startCustomer,
  operatorName,
  shopSharePercent,
  today,
  startDesigns,
}: {
  job?: EmbroideryJob;
  customer?: CustomerOption | null;
  operatorName: string;
  shopSharePercent: number;
  today: string;
  startDesigns?: Designs;
}) {
  const [state, action] = useActionState(saveEmbroideryJob, EMPTY_FORM_STATE);
  const e = state.errors ?? {};
  const [side, setSide] = useState<"shop" | "operator">(job?.side ?? "shop");
  const [customer, setCustomer] = useState<CustomerOption | null>(startCustomer ?? null);
  const [loading, startLoad] = useTransition();
  const [lookup, setLookup] = useState<Designs>(startDesigns ?? { designs: [], orders: [] });
  const [f, setF] = useState({
    orderId: job?.orderId ?? "",
    customerName: job?.customerName ?? "",
    date: job?.jobDate ?? today,
    description: job?.description ?? "",
    pieces: String(job?.pieces ?? 1),
    price: job ? (job.priceFils / 100).toFixed(2) : "",
    designFileUrl: job?.designFileUrl ?? "",
    designFileName: job?.designFileName ?? "",
    threadColours: job?.threadColours ?? "",
    designSize: job?.designSize ?? "",
    placement: job?.placement ?? "",
    notes: job?.notes ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const share = job?.shopSharePercent ?? shopSharePercent;
  const price = Math.round((Number(f.price) || 0) * 100);
  const shopPart = Math.round((price * share) / 100);
  const who = operatorName || "The operator";

  const pick = (id: string | null) => {
    if (!id) {
      setCustomer(null);
      setLookup({ designs: [], orders: [] });
      return;
    }
    startLoad(async () => {
      const [ctx, d] = await Promise.all([getCustomerContext(id), customerDesigns(id)]);
      setCustomer(ctx?.customer ?? null);
      setLookup(d);
      set({ orderId: "" });
    });
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload/design", { method: "POST", body });
      const json = (await res.json()) as { url?: string; name?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed.");
      set({ designFileUrl: json.url, designFileName: json.name ?? file.name });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const payload = JSON.stringify({ id: job?.id ?? null, side, customerId: customer?.id ?? "", ...f });

  return (
    <ActionForm action={action} className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-5">
        <FormMessage message={state.ok ? undefined : state.message} />
        <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Whose customer</span>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Whose customer">
              {(["shop", "operator"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={side === s}
                  disabled={Boolean(job)}
                  onClick={() => setSide(s)}
                  className={cn("rounded-[10px] border px-3 py-2.5 text-left disabled:opacity-70", side === s ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                >
                  <span className="block text-[14px] font-semibold">{s === "shop" ? "The shop's customer" : `${who}'s customer`}</span>
                  <span className={cn("text-[12px]", side === s ? "text-paper/75" : "text-ink-muted")}>{s === "shop" ? `${who} earns his share` : `${who} owes the shop its share`}</span>
                </button>
              ))}
            </div>
          </div>
          {side === "shop" ? (
            <>
              <CustomerPicker value={customer} onPick={pick} error={e.customerId?.[0]} />
              {loading ? <p className="text-[13px] text-ink-muted">Loading their designs and orders</p> : null}
              {customer && lookup.orders.length ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="orderId">For order, optional</Label>
                  <select id="orderId" value={f.orderId} onChange={(ev) => set({ orderId: ev.target.value })} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base">
                    <option value="">Not linked to an order</option>
                    {lookup.orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number}, {formatISODate(o.orderDate)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerName">Their customer</Label>
              <Input id="customerName" value={f.customerName} onChange={(ev) => set({ customerName: ev.target.value })} aria-invalid={e.customerName ? true : undefined} placeholder="Name, shop or school" />
              {e.customerName ? <p className="text-[13px] font-medium text-brand-deep">{e.customerName[0]}</p> : null}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">What is embroidered</Label>
            <Input id="description" value={f.description} onChange={(ev) => set({ description: ev.target.value })} aria-invalid={e.description ? true : undefined} placeholder="School logo on the chest pocket" />
            {e.description ? <p className="text-[13px] font-medium text-brand-deep">{e.description[0]}</p> : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pieces">Pieces</Label>
              <Input id="pieces" inputMode="numeric" value={f.pieces} onChange={(ev) => set({ pieces: ev.target.value.replace(/\D/g, "") })} className="tabular" aria-invalid={e.pieces ? true : undefined} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Price, AED</Label>
              <Input id="price" inputMode="decimal" value={f.price} onChange={(ev) => set({ price: ev.target.value.replace(/[^\d.]/g, "") })} className="tabular" placeholder="0.00" aria-invalid={e.price ? true : undefined} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jobDate">Date</Label>
              <Input id="jobDate" type="date" value={f.date} onChange={(ev) => set({ date: ev.target.value })} />
            </div>
          </div>
          {e.price || e.pieces ? <p className="-mt-2 text-[13px] font-medium text-brand-deep">{e.price?.[0] ?? e.pieces?.[0]}</p> : <p className="-mt-2 text-[12px] text-ink-muted">The whole job, before VAT. The split is worked out from this.</p>}
        </section>

        <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-medium">Design</h2>
          {customer && lookup.designs.length && !f.designFileUrl ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-ink-muted">Their earlier designs</p>
              <ul className="flex flex-col gap-1.5">
                {lookup.designs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => set({ designFileUrl: d.designFileUrl ?? "", designFileName: d.designFileName ?? "", threadColours: d.threadColours ?? "", designSize: d.designSize ?? "", placement: d.placement ?? "" })}
                      className="flex w-full items-center gap-3 rounded-[10px] border border-line px-3 py-2 text-left hover:bg-paper-deep"
                    >
                      <span className="flex-1 text-[14px] font-semibold">{d.designFileName}</span>
                      <span className="text-[12px] text-ink-muted">{d.description}</span>
                      <span className="text-[12px] font-semibold text-brand">Use it</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <input ref={fileInput} type="file" className="sr-only" onChange={(ev) => upload(ev.target.files?.[0])} />
          {f.designFileUrl ? (
            <div className="flex items-center gap-2 self-start rounded-full border border-line bg-paper-deep/60 py-1 pr-1 pl-3 text-[14px]">
              <a href={f.designFileUrl} target="_blank" rel="noreferrer" className="max-w-[260px] truncate font-semibold hover:underline">
                {f.designFileName || "Design file"}
              </a>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove the design file" onClick={() => set({ designFileUrl: "", designFileName: "" })}>
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="self-start" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />}
              Upload the machine file
            </Button>
          )}
          {uploadError ? <p className="text-[13px] font-medium text-brand-deep">{uploadError}</p> : <p className="-mt-2 text-[12px] text-ink-muted">Any format the machine uses, such as DST or PES. Up to 4 MB.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="threads">Thread colours</Label>
              <Input id="threads" value={f.threadColours} onChange={(ev) => set({ threadColours: ev.target.value })} placeholder="Navy, gold 1513" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="size">Size</Label>
              <Input id="size" value={f.designSize} onChange={(ev) => set({ designSize: ev.target.value })} placeholder="8 x 6 cm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="placement">Placement</Label>
              <Input id="placement" value={f.placement} onChange={(ev) => set({ placement: ev.target.value })} placeholder="Left chest" />
            </div>
          </div>
          <Textarea value={f.notes} onChange={(ev) => set({ notes: ev.target.value })} rows={2} placeholder="Notes for the operator, optional" aria-label="Notes" />
        </section>
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-6">
        <section className="tabular rounded-[14px] border border-line bg-surface p-5 text-[15px]">
          <p className="text-[13px] font-semibold text-ink-muted">The split, {share}% to the shop</p>
          <dl className="mt-3 flex flex-col gap-1.5">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Job price</dt>
              <dd>{formatFils(price)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Shop</dt>
              <dd>{formatFils(shopPart)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{who}</dt>
              <dd>{formatFils(price - shopPart)}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-[14px] font-semibold">
            {side === "shop" ? `When done, the shop owes ${who} ${formatFils(price - shopPart)}.` : `When done, ${who} owes the shop ${formatFils(shopPart)}.`}
          </p>
        </section>
        <SubmitButton size="lg" pendingText="Saving" disabled={uploading}>
          {job ? "Save job" : "Add job"}
        </SubmitButton>
        <LinkButton href={job ? `/workshop/embroidery/${job.id}` : "/workshop/embroidery"} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
