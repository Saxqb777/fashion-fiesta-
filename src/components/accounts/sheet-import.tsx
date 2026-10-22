"use client";

import { useRef, useState, useTransition } from "react";
import { ClipboardPasteIcon, DownloadIcon, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseCsv, parsePasted, type RawCell } from "@/lib/bulk-lines";
import { cn } from "cn";

export type SheetColumn = { key: string; title: string; hint: string; synonyms: string[]; required?: boolean };
type Row = { n: number; cells: Record<string, string>; errors: string[] };

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const cellText = (v: RawCell) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim());

/** Reads any sheet with a header row. Without one, columns are taken in template order. */
function readRows(raw: RawCell[][], columns: SheetColumn[], check: (cells: Record<string, string>) => string[]): Row[] {
  let start = 0;
  let map: Record<string, number> = Object.fromEntries(columns.map((c, i) => [c.key, i]));
  for (let r = 0; r < Math.min(raw.length, 6); r++) {
    const found: Record<string, number> = {};
    raw[r].forEach((cell, c) => {
      const col = columns.find((x) => !(x.key in found) && [norm(x.title), ...x.synonyms].includes(norm(cell)));
      if (col) found[col.key] = c;
    });
    const required = columns.filter((c) => c.required).map((c) => c.key);
    if (required.every((k) => k in found)) {
      start = r + 1;
      map = found;
      break;
    }
  }
  return raw
    .slice(start)
    .map((cells, i) => {
      const obj = Object.fromEntries(columns.map((c) => [c.key, map[c.key] === undefined ? "" : cellText(cells[map[c.key]])]));
      return { n: start + i + 1, cells: obj, errors: [] as string[] };
    })
    .filter((r) => Object.values(r.cells).some(Boolean))
    .map((r) => ({ ...r, errors: [...columns.filter((c) => c.required && !r.cells[c.key]).map((c) => `${c.title} is empty.`), ...check(r.cells)] }));
}

export function SheetImport({
  open,
  onOpenChange,
  title,
  description,
  columns,
  templateName,
  check = () => [],
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: SheetColumn[];
  templateName: string;
  check?: (cells: Record<string, string>) => string[];
  onImport: (rows: Record<string, string>[]) => Promise<{ ok?: boolean; error?: string; message?: string }>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setPaste("");
    setError("");
  };
  const load = (raw: RawCell[][]) => {
    const r = readRows(raw, columns, check);
    if (!r.length) return setError("No rows found. The first row should be the column names.");
    setError("");
    setRows(r);
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (/\.csv$/i.test(file.name)) load(parseCsv(await file.text()));
      else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const sheets = await readXlsxFile(file);
        load((sheets[0]?.data ?? []) as unknown as RawCell[][]);
      }
    } catch {
      setError("That file could not be read. Save it as .xlsx or .csv and try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const template = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    await writeXlsxFile(
      [
        { sheet: "Rows", data: [columns.map((c) => ({ value: c.title, fontWeight: "bold" as const, backgroundColor: "#F3EEE7" }))], columns: columns.map(() => ({ width: 24 })), stickyRowsCount: 1 },
        { sheet: "How to fill", data: columns.map((c) => [{ value: c.title, fontWeight: "bold" as const }, c.hint]), columns: [{ width: 22 }, { width: 90 }] },
      ],
      {},
    ).toFile(templateName);
  };

  const bad = rows?.filter((r) => r.errors.length) ?? [];
  const good = rows?.filter((r) => !r.errors.length) ?? [];

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{rows ? "Check the rows. Red ones are skipped." : description}</DialogDescription>
        </DialogHeader>
        {!rows ? (
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
                <span className="text-[13px] text-ink-muted">Excel .xlsx or .csv, column names in the first row.</span>
              </button>
              <button type="button" onClick={template} className="flex flex-col items-start gap-2 rounded-[14px] border border-line p-5 text-left transition-colors hover:bg-paper-deep">
                <DownloadIcon className="size-6 text-sky" />
                <span className="text-[16px] font-semibold">Download the template</span>
                <span className="text-[13px] text-ink-muted">Send it to the customer, or fill it yourself.</span>
              </button>
            </div>
            <input ref={fileInput} type="file" accept=".xlsx,.csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="flex flex-col gap-2">
              <label htmlFor="sheetPaste" className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardPasteIcon className="size-4 text-ink-muted" />
                Or paste rows from Excel or Google Sheets
              </label>
              <Textarea id="sheetPaste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={columns.map((c) => c.title).join("\t")} className="tabular min-h-28 font-mono text-[13px]" />
              <Button type="button" variant="outline" className="self-start" disabled={!paste.trim()} onClick={() => load(parsePasted(paste))}>
                Check pasted rows
              </Button>
            </div>
            {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[15px]">
              <span className="font-semibold">{rows.length} rows. </span>
              {bad.length ? <span className="font-semibold text-brand-deep">{bad.length} skipped. </span> : <span className="font-semibold text-[#4d7a12]">All good. </span>}
              <span className="text-ink-muted">A name that is already on the list updates that row.</span>
            </p>
            <div className="overflow-x-auto rounded-[14px] border border-line">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-paper-deep/70 text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2">
                        {c.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className={cn("border-t border-line align-top", r.errors.length && "bg-brand-soft/60")}>
                      <td className="tabular px-3 py-2 text-ink-muted">{r.n}</td>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          {r.cells[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bad.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-[13px] font-medium text-brand-deep">
                {bad.map((r) => (
                  <li key={r.n}>
                    Row {r.n}: {r.errors.join(" ")}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={reset}>
                Use another sheet
              </Button>
              <Button
                type="button"
                size="lg"
                disabled={!good.length || saving}
                onClick={() =>
                  start(async () => {
                    const res = await onImport(good.map((r) => r.cells));
                    if (res.ok) {
                      toast.success(res.message ?? "Imported.");
                      reset();
                      onOpenChange(false);
                    } else toast.error(res.error ?? "Could not import.");
                  })
                }
              >
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {good.length ? `Import ${good.length} ${good.length === 1 ? "row" : "rows"}` : "Nothing to import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
