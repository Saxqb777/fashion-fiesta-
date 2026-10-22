"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPasteIcon, DownloadIcon, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { importDrafts, type CustomerContext } from "@/actions/documents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BULK_COLUMNS, checkRows, groupByBranch, parseCsv, parsePasted, type BulkField, type BulkRow, type Lookups, type RawCell } from "@/lib/bulk-lines";
import { cn } from "cn";
import type { EditorLine } from "./document-editor";

type Option = { id: string; name: string };

let n = 0;
const key = () => `x${Date.now().toString(36)}${(n++).toString(36)}`;

export function toEditorLine(r: BulkRow): EditorLine {
  return {
    key: key(),
    productId: r.productId,
    description: r.item,
    qty: String(r.qty || 1),
    unitPrice: r.unitPrice,
    notes: r.notes,
    dueDate: r.dueDate,
    fabricId: r.fabricId ?? "",
    measurementId: r.measurementId ?? "",
    assignments: r.assignment ? [{ key: key(), type: r.assignment.type, assigneeId: r.assignment.assigneeId, qty: String(r.qty || 1) }] : [],
  };
}

async function downloadTemplate(mode: "order" | "quote") {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = BULK_COLUMNS.map((c) => ({ value: c.title, fontWeight: "bold" as const, backgroundColor: "#F3EEE7" }));
  const help = [
    [{ value: "How to fill the Lines sheet", fontWeight: "bold" as const }],
    [""],
    ...BULK_COLUMNS.map((c) => [{ value: c.title, fontWeight: "bold" as const }, c.hint]),
    [""],
    ["One row per item. Leave a column empty if you do not know it."],
    ["Use the same branch names as on the customer page. Several branches make one draft per branch."],
    [`Then in Fashion Fiesta: New ${mode}, pick the customer, Add lines from Excel, upload this file.`],
  ];
  await writeXlsxFile(
    [
      { sheet: "Lines", data: [header], columns: [{ width: 32 }, { width: 8 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 32 }], stickyRowsCount: 1 },
      { sheet: "How to fill", data: help, columns: [{ width: 22 }, { width: 90 }] },
    ],
    {},
  ).toFile(`fashion-fiesta-${mode}-lines.xlsx`);
}

export function BulkImportDialog({
  open,
  onOpenChange,
  mode,
  ctx,
  lookups,
  header,
  onAddLines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "order" | "quote";
  ctx: CustomerContext | null;
  lookups: { products: Lookups["products"]; fabrics: Lookups["fabrics"]; tailors: Option[]; units: Option[] };
  /** Order or quote header used when a sheet is split into one draft per branch. */
  header: { date: string; dueDate: string; validUntil: string; notes: string; customerPoNumber: string };
  onAddLines: (lines: EditorLine[], branchId: string | null) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [paste, setPaste] = useState("");
  const [skipBad, setSkipBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, startSaving] = useTransition();
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setPaste("");
    setSkipBad(false);
    setFileError("");
  };

  const check = (raw: RawCell[][]) => {
    if (!ctx) return;
    const checked = checkRows(raw, {
      ...lookups,
      branches: ctx.branches,
      measurements: ctx.measurements,
      lastPrices: ctx.lastPrices,
    });
    if (!checked.length) {
      setFileError("No rows found. Fill at least one row with an item and a qty.");
      return;
    }
    setFileError("");
    setRows(checked);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        check(parseCsv(await file.text()));
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const sheets = await readXlsxFile(file);
        const sheet = sheets.find((s) => s.sheet.toLowerCase() === "lines") ?? sheets[0];
        check((sheet?.data ?? []) as unknown as RawCell[][]);
      }
    } catch {
      setFileError("That file could not be read. Save it as .xlsx or .csv and try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const bad = rows?.filter((r) => Object.keys(r.errors).length) ?? [];
  const usable = rows?.filter((r) => !Object.keys(r.errors).length) ?? [];
  const chosen = skipBad ? usable : bad.length ? [] : usable;
  const groups = ctx ? groupByBranch(chosen, ctx.branches) : [];
  const split = groups.length > 1;
  const noun = mode === "order" ? (groups.length === 1 ? "draft order" : "draft orders") : groups.length === 1 ? "quote" : "quotes";

  const add = () => {
    if (!ctx || !chosen.length) return;
    if (!split) {
      onAddLines(chosen.map(toEditorLine), groups[0]?.branchId ?? null);
      toast.success(`${chosen.length} ${chosen.length === 1 ? "line" : "lines"} added. Check them, then save.`);
      reset();
      onOpenChange(false);
      return;
    }
    startSaving(async () => {
      const docs = groups.map((g) => ({
        customerId: ctx.customer.id,
        branchId: g.branchId,
        date: header.date,
        dueDate: header.dueDate,
        validUntil: header.validUntil,
        notes: header.notes,
        customerPoNumber: header.customerPoNumber,
        lines: g.rows.map((r) => {
          const l = toEditorLine(r);
          return {
            productId: l.productId,
            description: l.description,
            qty: Number(l.qty),
            unitPrice: l.unitPrice,
            notes: l.notes,
            dueDate: l.dueDate,
            fabricId: l.fabricId || null,
            measurementId: l.measurementId || null,
            assignments: mode === "order" ? l.assignments.map((a) => ({ type: a.type, assigneeId: a.assigneeId, qty: Number(a.qty) })) : [],
          };
        }),
      }));
      const res = await importDrafts({ mode, docs });
      if (res.ok) {
        toast.success(`${res.count} ${noun} made, one per branch. Review and confirm each.`);
        reset();
        onOpenChange(false);
        router.push(mode === "order" ? "/orders?view=drafts" : "/orders/quotes?status=draft");
      } else {
        toast.error(res.error ?? "Could not make the drafts.");
      }
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add lines from Excel</DialogTitle>
          <DialogDescription>
            {rows ? "Check the rows. Red ones need fixing in your sheet." : "For big orders. Use our template, upload any sheet with an Item and Qty column, or paste rows."}
          </DialogDescription>
        </DialogHeader>

        {!ctx ? (
          <p className="rounded-[10px] bg-paper-deep px-4 py-3 text-[15px]">Pick the customer first, so branches and measurement sets can be matched.</p>
        ) : !rows ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="flex flex-col items-start gap-2 rounded-[14px] border-2 border-dashed border-line p-5 text-left transition-colors hover:border-brand/40"
              >
                {busy ? <Loader2Icon className="size-6 animate-spin text-ink-muted" /> : <FileSpreadsheetIcon className="size-6 text-[#4d7a12]" />}
                <span className="text-[16px] font-semibold">Upload a sheet</span>
                <span className="text-[13px] text-ink-muted">Excel .xlsx or .csv. The first row should be the column names.</span>
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate(mode)}
                className="flex flex-col items-start gap-2 rounded-[14px] border border-line p-5 text-left transition-colors hover:bg-paper-deep"
              >
                <DownloadIcon className="size-6 text-sky" />
                <span className="text-[16px] font-semibold">Download the template</span>
                <span className="text-[13px] text-ink-muted">Send it to the customer, or fill it yourself. The second tab explains each column.</span>
              </button>
            </div>
            <input ref={fileInput} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />

            <div className="flex flex-col gap-2">
              <label htmlFor="bulkPaste" className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardPasteIcon className="size-4 text-ink-muted" />
                Or paste rows from Excel or Google Sheets
              </label>
              <Textarea
                id="bulkPaste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"Item\tQty\tPrice AED\tBranch\nSpa tunic\t20\t60\tKhalifa City"}
                className="tabular min-h-32 font-mono text-[13px]"
              />
              <Button type="button" variant="outline" className="self-start" disabled={!paste.trim()} onClick={() => check(parsePasted(paste))}>
                Check pasted rows
              </Button>
            </div>
            {fileError ? <p className="text-[13px] font-medium text-brand-deep">{fileError}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
              <span className="font-semibold">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </span>
              {bad.length ? <span className="font-semibold text-brand-deep">{bad.length} need fixing</span> : <span className="font-semibold text-[#4d7a12]">All good</span>}
              {split ? (
                <span className="text-ink-muted">
                  Makes {groups.length} {noun}, one per branch: {groups.map((g) => `${g.label} (${g.rows.length})`).join(", ")}
                </span>
              ) : groups[0]?.branchId ? (
                <span className="text-ink-muted">Branch: {groups[0].label}</span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-[14px] border border-line">
              <table className="tabular w-full min-w-[760px] text-left text-[13px]">
                <thead className="bg-paper-deep/70 text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    {BULK_COLUMNS.map((c) => (
                      <th key={c.key} className="px-3 py-2">
                        {c.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const failed = Object.keys(r.errors).length > 0;
                    return (
                      <tr key={r.rowNumber} className={cn("border-t border-line align-top", failed && "bg-brand-soft/60", failed && skipBad && "opacity-40")}>
                        <td className="px-3 py-2 text-ink-muted">{r.rowNumber}</td>
                        {BULK_COLUMNS.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2", r.errors[c.key as BulkField] && "font-semibold text-brand-deep")}>
                            {r.cells[c.key as BulkField]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {bad.length || rows.some((r) => r.warnings.length) ? (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px]">
                {rows.flatMap((r) => [
                  ...Object.values(r.errors).map((m, i) => (
                    <li key={`e${r.rowNumber}${i}`} className="font-medium text-brand-deep">
                      Row {r.rowNumber}: {m}
                    </li>
                  )),
                  ...r.warnings.map((m, i) => (
                    <li key={`w${r.rowNumber}${i}`} className="text-ink-muted">
                      Row {r.rowNumber}: {m}
                    </li>
                  )),
                ])}
              </ul>
            ) : null}

            {bad.length ? (
              <label className="flex items-center gap-2 text-[15px]">
                <input type="checkbox" checked={skipBad} onChange={(e) => setSkipBad(e.target.checked)} className="size-5 accent-[#D7182A]" />
                Skip the {bad.length} red {bad.length === 1 ? "row" : "rows"} and add the rest
              </label>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={reset}>
                Use another sheet
              </Button>
              <Button type="button" size="lg" disabled={!chosen.length || saving} onClick={add}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {!chosen.length
                  ? "Fix the red rows first"
                  : split
                    ? `Make ${groups.length} ${noun}`
                    : `Add ${chosen.length} ${chosen.length === 1 ? "line" : "lines"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
