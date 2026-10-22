"use client";

import { useRef, useState } from "react";
import { ClipboardPasteIcon, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import type { PoFabric } from "./po-editor";

type Cell = string | number | boolean | Date | null;
type Row = { n: number; name: string; colour: string; qty: string; price: string; fabricId: string | null; error: string | null };
export type ImportedPoLine = { fabricId: string | null; description: string; qty: string; unitPrice: string };

const num = (v: Cell) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const text = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());

/** Finds the columns by their names, so the supplier's own sheet works as long as it says fabric and metres. */
function readRows(raw: Cell[][], fabrics: PoFabric[]): Row[] {
  const headerAt = raw.findIndex((r) => r.some((c) => /fabric|item|description/i.test(text(c))));
  if (headerAt < 0) return [];
  const head = raw[headerAt].map((c) => text(c).toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iName = col(/fabric|item|description/);
  const iColour = col(/colou?r/);
  const iQty = col(/metre|meter|qty|quantity/);
  const iPrice = col(/price|rate|cost/);
  return raw
    .slice(headerAt + 1)
    .map((r, k) => {
      const name = text(r[iName]);
      const colour = iColour >= 0 ? text(r[iColour]) : "";
      if (!name) return null;
      const label = colour && !name.toLowerCase().includes(colour.toLowerCase()) ? `${name}, ${colour}` : name;
      const match = fabrics.find((f) => [f.name, f.colour].filter(Boolean).join(", ").toLowerCase() === label.toLowerCase() || f.name.toLowerCase() === label.toLowerCase());
      const q = iQty >= 0 ? num(r[iQty]) : NaN;
      const p = iPrice >= 0 ? num(r[iPrice]) : NaN;
      const price = Number.isFinite(p) && p > 0 ? p.toFixed(2) : match ? (match.costFils / 100).toFixed(2) : "";
      return {
        n: headerAt + k + 2,
        name: match?.name ?? label,
        colour,
        qty: Number.isFinite(q) && q > 0 ? String(q) : "",
        price,
        fabricId: match?.id ?? null,
        error: !(Number.isFinite(q) && q > 0) ? "Metres missing" : !price ? "Price missing" : null,
      };
    })
    .filter((r): r is Row => r !== null);
}

export function PoExcelImport({ fabrics, onAdd }: { fabrics: PoFabric[]; onAdd: (lines: ImportedPoLine[]) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const take = (raw: Cell[][]) => {
    const r = readRows(raw, fabrics);
    if (!r.length) setError("No fabric rows found. The first row should name the columns, for example Fabric and Metres.");
    else {
      setError("");
      setRows(r);
    }
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (/\.csv$/i.test(file.name)) take((await file.text()).split(/\r?\n/).map((l) => l.split(",")));
      else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const sheets = await readXlsxFile(file);
        take((sheets[0]?.data ?? []) as unknown as Cell[][]);
      }
    } catch {
      setError("That file could not be read. Save it as .xlsx or .csv and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const good = rows?.filter((r) => !r.error) ?? [];
  const close = () => {
    setOpen(false);
    setRows(null);
    setPaste("");
    setError("");
  };

  return (
    <>
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)} data-mission="po-excel">
        <FileSpreadsheetIcon />
        Add lines from Excel
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add lines from Excel</DialogTitle>
            <DialogDescription>{rows ? "Check the rows. Red ones are skipped." : "Any sheet with a Fabric and a Metres column. A price column is optional: your last cost is used."}</DialogDescription>
          </DialogHeader>
          {!rows ? (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
                className="flex flex-col items-start gap-2 rounded-[14px] border-2 border-dashed border-line p-5 text-left transition-colors hover:border-brand/40"
              >
                {busy ? <Loader2Icon className="size-6 animate-spin text-ink-muted" /> : <FileSpreadsheetIcon className="size-6 text-[#4d7a12]" />}
                <span className="text-[16px] font-semibold">Upload a sheet</span>
                <span className="text-[13px] text-ink-muted">Excel .xlsx or .csv.</span>
              </button>
              <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              <label htmlFor="poPaste" className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardPasteIcon className="size-4 text-ink-muted" />
                Or paste rows
              </label>
              <Textarea id="poPaste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Fabric\tMetres\tPrice per metre\nLinen, beige\t40\t22"} className="tabular min-h-28 font-mono text-[13px]" />
              <Button type="button" variant="outline" className="self-start" disabled={!paste.trim()} onClick={() => take(paste.split(/\r?\n/).map((l) => l.split("\t")))}>
                Check pasted rows
              </Button>
              {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line">
                {rows.map((r) => (
                  <li key={r.n} className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-[14px]", r.error && "bg-brand-soft/60")}>
                    <span className="min-w-0 flex-1 font-semibold">
                      {r.name}
                      {r.fabricId ? null : <span className="ml-2 text-[12px] font-medium text-ink-muted">new fabric</span>}
                    </span>
                    <span className="tabular">{r.qty ? `${r.qty} m` : ""}</span>
                    <span className="tabular w-24 text-right">{r.price ? `${r.price} / m` : ""}</span>
                    {r.error ? <span className="w-full text-[12px] font-semibold text-brand-deep">Row {r.n}: {r.error}</span> : null}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRows(null)}>
                  Use another sheet
                </Button>
                <Button
                  type="button"
                  disabled={!good.length}
                  onClick={() => {
                    onAdd(good.map((r) => ({ fabricId: r.fabricId, description: r.name, qty: r.qty, unitPrice: r.price })));
                    toast.success(`${good.length} ${good.length === 1 ? "line" : "lines"} added. Check them, then save.`);
                    close();
                  }}
                >
                  Add {good.length} {good.length === 1 ? "line" : "lines"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
