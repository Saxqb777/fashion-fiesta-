"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { CameraIcon, CheckIcon, FileTextIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { getCustomerContext, importDrafts, type CustomerContext } from "@/actions/documents";
import { TierTag } from "@/components/data/tags";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatISODate } from "@/lib/dates";
import { toDocRows, type DocRow, type DocumentReading, type ReadDocumentResponse } from "@/lib/document-lines";
import { cn } from "cn";
import { CustomerPicker } from "./customer-picker";
import type { EditorLine } from "./document-editor";

type Product = { id: string; name: string; priceFils: number };

export type DocumentApplied = {
  ctx: CustomerContext;
  branchId: string | null;
  lines: EditorLine[];
  customerPoNumber: string | null;
  dueDate: string | null;
  file: { url: string; name: string };
};

/** Photos are shrunk on the phone. Handwriting needs more pixels than a fabric photo. */
async function shrink(file: File, maxSide = 2200): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const SWOOSH = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta"];

/** The four swoosh colours sweep down the page while Claude reads. */
function Reading({ name }: { name: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="relative h-44 w-36 overflow-hidden rounded-[10px] border border-line bg-surface p-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="mb-2.5 block h-1.5 rounded-full bg-paper-deep" style={{ width: `${[90, 70, 85, 60, 95, 75, 80, 55, 70][i]}%` }} />
        ))}
        <motion.div
          aria-hidden
          className="absolute inset-x-0 flex h-1"
          initial={{ top: "6%" }}
          animate={reduce ? { top: "50%" } : { top: ["6%", "92%", "6%"] }}
          transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {SWOOSH.map((c) => (
            <span key={c} className={cn("h-full flex-1", c)} />
          ))}
        </motion.div>
      </div>
      <div className="text-center">
        <p className="text-[16px] font-semibold">Reading {name}</p>
        <p className="mt-1 text-[14px] text-ink-muted">Big documents and handwriting take up to a minute.</p>
      </div>
    </div>
  );
}

export function ReadDocumentDialog({
  open,
  onOpenChange,
  mode,
  ctx,
  products,
  vatRateBp,
  header,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "order" | "quote";
  ctx: CustomerContext | null;
  products: Product[];
  vatRateBp: number;
  header: { date: string; dueDate: string; validUntil: string; notes: string };
  onApply: (applied: DocumentApplied) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<ReadDocumentResponse, { ok: true }> | null>(null);
  const [customer, setCustomer] = useState<CustomerContext | null>(null);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [poNumber, setPoNumber] = useState("");
  const [loadingCustomer, startCustomer] = useTransition();
  const [saving, startSaving] = useTransition();
  const isOrder = mode === "order";
  const noun = isOrder ? "order" : "quote";

  const reset = () => {
    abort.current?.abort();
    setStage("pick");
    setFileName("");
    setError("");
    setResult(null);
    setCustomer(null);
    setRows([]);
    setPoNumber("");
  };

  const mapRows = (reading: DocumentReading, c: CustomerContext | null) =>
    toDocRows(reading, { products, branches: c?.branches ?? [], lastPrices: c?.lastPrices ?? {}, vatRateBp });

  const chooseCustomer = (id: string | null, reading: DocumentReading) => {
    if (!id) {
      setCustomer(null);
      setRows(mapRows(reading, null));
      return;
    }
    startCustomer(async () => {
      const next = id === ctx?.customer.id ? ctx : await getCustomerContext(id);
      setCustomer(next);
      setRows(mapRows(reading, next));
    });
  };

  const read = async (picked: File | undefined) => {
    if (!picked) return;
    setError("");
    setFileName(picked.name || "the photo");
    setStage("reading");
    const file = picked.type.startsWith("image/") ? await shrink(picked) : picked;
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    if (ctx) body.set("customerId", ctx.customer.id);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/read-document", { method: "POST", body, signal: abort.current.signal });
      const data = (await res.json().catch(() => ({ ok: false, error: "Could not read it right now. Try again in a minute." }))) as ReadDocumentResponse;
      if (!data.ok) throw new Error(data.error);
      if (!data.reading.readable || !data.reading.lines.length) {
        throw new Error(data.reading.remarks[0] ?? "No order lines found in this document. Add the lines by hand or from Excel.");
      }
      setResult(data);
      setPoNumber(data.reading.customer_po_number ?? "");
      // The document names the customer; otherwise keep the one already picked.
      chooseCustomer(data.customer?.id ?? ctx?.customer.id ?? null, data.reading);
      setStage("review");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not read it. Add the lines by hand or from Excel.");
      setStage("pick");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };

  const update = (key: string, patch: Partial<DocRow>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // A field she typed is no longer in doubt.
        if (patch.qty !== undefined) next.unsure = next.unsure.filter((u) => u !== "qty");
        if (patch.unitPrice !== undefined) next.unsure = next.unsure.filter((u) => u !== "unitPrice");
        return next;
      }),
    );

  const reading = result?.reading;
  const groups = new Map<string, DocRow[]>();
  for (const r of rows) groups.set(r.branchId ?? "", [...(groups.get(r.branchId ?? "") ?? []), r]);
  const split = groups.size > 1;
  const missingQty = rows.filter((r) => !Number(r.qty)).length;
  const due = reading?.required_by && /^\d{4}-\d{2}-\d{2}$/.test(reading.required_by) ? reading.required_by : null;

  const toEditor = (r: DocRow): EditorLine => ({
    key: r.key,
    productId: r.productId,
    description: r.description,
    qty: r.qty,
    unitPrice: r.unitPrice,
    notes: r.notes,
    dueDate: "",
    fabricId: "",
    measurementId: "",
    assignments: [],
    fromDocument: { issues: r.issues, unsure: r.unsure },
  });

  const putOnOne = () => {
    if (!customer || !result) return;
    const branchIds = [...groups.keys()].filter(Boolean);
    onApply({
      ctx: customer,
      branchId: branchIds.length === 1 ? branchIds[0] : null,
      lines: rows.map(toEditor),
      customerPoNumber: isOrder ? poNumber.trim() || null : null,
      dueDate: due,
      file: result.file,
    });
    toast.success(`${rows.length} ${rows.length === 1 ? "line" : "lines"} from the document. Check the marked ones, then save.`);
    reset();
    onOpenChange(false);
  };

  const makeDrafts = () => {
    if (!customer || !result) return;
    startSaving(async () => {
      const docs = [...groups.entries()].map(([branchId, list]) => ({
        customerId: customer.customer.id,
        branchId: branchId || null,
        date: header.date,
        dueDate: due ?? header.dueDate,
        validUntil: header.validUntil,
        notes: header.notes,
        customerPoNumber: isOrder ? poNumber.trim() : "",
        customerPoFileUrl: result.file.url,
        customerPoFileName: result.file.name,
        lines: list.map((r) => ({
          productId: r.productId,
          description: r.description,
          qty: Number(r.qty),
          unitPrice: r.unitPrice,
          notes: r.notes,
          dueDate: "",
          fabricId: null,
          measurementId: null,
          assignments: [],
        })),
      }));
      const res = await importDrafts({ mode, docs });
      if (res.ok) {
        toast.success(`${res.count} ${isOrder ? "draft orders" : "quotes"} made, one per branch. Review and confirm each.`);
        reset();
        onOpenChange(false);
        router.push(isOrder ? "/orders?view=drafts" : "/orders/quotes?status=draft");
      } else toast.error(res.error ?? "Could not make the drafts.");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Read their document</DialogTitle>
          <DialogDescription>
            {stage === "review"
              ? "Check what was read. Red means missing or unsure. Nothing is saved until you save the " + noun + "."
              : "Their PO, their quote, a photo of a handwritten slip, a WhatsApp screenshot or an Excel sheet. Claude reads it and fills the lines for you to check."}
          </DialogDescription>
        </DialogHeader>

        {stage === "pick" ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                data-guide="doc-file"
                onClick={() => fileInput.current?.click()}
                className="flex min-h-36 flex-col items-start gap-2 rounded-[14px] border-2 border-dashed border-line p-5 text-left transition-colors hover:border-brand/40"
              >
                <UploadIcon className="size-6 text-brand" />
                <span className="text-[16px] font-semibold">Choose a file</span>
                <span className="text-[13px] text-ink-muted">PDF, photo, screenshot or Excel .xlsx. Up to 4 MB.</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="flex min-h-36 flex-col items-start gap-2 rounded-[14px] border border-line p-5 text-left transition-colors hover:bg-paper-deep"
              >
                <CameraIcon className="size-6 text-sky" />
                <span className="text-[16px] font-semibold">Take a photo</span>
                <span className="text-[13px] text-ink-muted">Lay the paper flat in good light, the whole page in the frame.</span>
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/*,.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => read(e.target.files?.[0])}
            />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
            {!ctx ? <p className="text-[13px] text-ink-muted">No customer picked yet. Claude finds them from the document, or you pick them after.</p> : null}
            {error ? <p className="rounded-[10px] bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand-deep">{error}</p> : null}
          </div>
        ) : stage === "reading" ? (
          <div className="flex flex-col items-center">
            <Reading name={fileName} />
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        ) : reading && result ? (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-3 rounded-[14px] border border-line p-4">
              <a href={result.file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 self-start text-[13px] font-semibold text-ink-muted hover:text-ink">
                <FileTextIcon className="size-4" />
                {result.file.name}
              </a>
              {customer ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CheckIcon className="size-4 text-[#4d7a12]" />
                  <span className="text-[16px] font-semibold">{customer.customer.name}</span>
                  {customer.customer.tier === "vip" ? <TierTag tier="vip" /> : null}
                  {reading.customer_as_written && !result.customer && customer ? <span className="text-[13px] text-ink-muted">Picked by you. The document says {reading.customer_as_written}.</span> : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => chooseCustomer(null, reading)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-[10px] border border-brand/40 bg-brand-soft/50 p-3">
                  <p className="text-[14px] font-semibold text-brand-deep">
                    {reading.customer_as_written ? `"${reading.customer_as_written}" is not on your customer list. Pick them, or add them.` : "The document does not say who the customer is. Pick them."}
                  </p>
                  <CustomerPicker value={null} onPick={(id) => chooseCustomer(id, reading)} />
                </div>
              )}
              {loadingCustomer ? <p className="text-[13px] text-ink-muted">Loading their branches and prices</p> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {isOrder ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="docPo">Customer PO number</Label>
                    <Input id="docPo" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Not on the document" />
                  </div>
                ) : null}
                {due ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">Needed by</span>
                    <p className="flex h-11 items-center text-[15px]">{formatISODate(due, true)}</p>
                  </div>
                ) : null}
              </div>
              {reading.remarks.length ? (
                <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[14px]">
                  {reading.remarks.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sun" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <ul className="flex flex-col gap-2">
              {rows.map((r, i) => {
                const branchName = r.branchId ? customer?.branches.find((b) => b.id === r.branchId)?.name : null;
                return (
                  <li key={r.key} className={cn("rounded-[14px] border p-4", r.unsure.length ? "border-brand/40" : "border-line")}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <p className="tabular text-[12px] font-semibold text-ink-muted">
                          Line {i + 1}
                          {branchName ? ` · ${branchName}` : r.branchText ? ` · ${r.branchText}` : ""}
                        </p>
                        <p className={cn("text-[16px] font-semibold", r.unsure.includes("description") && "text-brand-deep")}>{r.description}</p>
                        {r.notes ? <p className="mt-1 text-[13px] whitespace-pre-line text-ink-muted">{r.notes}</p> : null}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[12px] text-ink-muted">Qty</Label>
                          <Input
                            value={r.qty}
                            inputMode="numeric"
                            onChange={(e) => update(r.key, { qty: e.target.value.replace(/\D/g, "") })}
                            aria-label={`Line ${i + 1} quantity`}
                            aria-invalid={r.unsure.includes("qty") || !Number(r.qty) ? true : undefined}
                            className="tabular w-20"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[12px] text-ink-muted">Price, AED</Label>
                          <Input
                            value={r.unitPrice}
                            inputMode="decimal"
                            placeholder="0.00"
                            onChange={(e) => update(r.key, { unitPrice: e.target.value.replace(/[^\d.]/g, "") })}
                            aria-label={`Line ${i + 1} price before VAT`}
                            aria-invalid={r.unsure.includes("unitPrice") || !r.unitPrice ? true : undefined}
                            className="tabular w-28"
                          />
                        </div>
                      </div>
                    </div>
                    {r.issues.length ? (
                      <ul className="mt-2 flex flex-col gap-0.5 text-[13px]">
                        {r.issues.map((m) => (
                          <li key={m} className={/^No |hard to read|add up/.test(m) ? "font-medium text-brand-deep" : "text-ink-muted"}>
                            {m}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="sticky -bottom-6 -mx-6 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-6 py-4">
              <Button type="button" variant="ghost" onClick={reset}>
                Read another
              </Button>
              {split ? (
                <>
                  <Button type="button" variant="outline" disabled={!customer || loadingCustomer} onClick={putOnOne}>
                    All on this {noun}
                  </Button>
                  <Button type="button" size="lg" disabled={!customer || loadingCustomer || saving || missingQty > 0} onClick={makeDrafts} data-guide="doc-drafts">
                    {saving ? <Loader2Icon className="animate-spin" /> : null}
                    {missingQty ? `Fill ${missingQty} missing ${missingQty === 1 ? "quantity" : "quantities"} first` : `Make ${groups.size} draft ${isOrder ? "orders" : "quotes"}, one per branch`}
                  </Button>
                </>
              ) : (
                <Button type="button" size="lg" disabled={!customer || loadingCustomer} onClick={putOnOne} data-guide="doc-put">
                  Put {rows.length} {rows.length === 1 ? "line" : "lines"} on the {noun}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

