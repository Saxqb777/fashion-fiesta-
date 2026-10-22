/**
 * Bulk lines from Excel, CSV or pasted rows. Pure functions, run in the browser.
 * Nothing here saves anything: rows land in the normal editor, or become drafts.
 */

export type BulkField = "item" | "qty" | "price" | "branch" | "size" | "fabric" | "due" | "makeBy" | "notes";

export const BULK_COLUMNS: { key: BulkField; title: string; hint: string; synonyms: string[] }[] = [
  { key: "item", title: "Item", hint: "Required. What it is: School pinafore, Spa tunic.", synonyms: ["item", "items", "description", "product", "article", "garment"] },
  { key: "qty", title: "Qty", hint: "Required. Whole pieces.", synonyms: ["qty", "quantity", "pcs", "pieces", "no of pcs", "count"] },
  { key: "price", title: "Price AED", hint: "Before VAT, per piece. Empty uses their last price.", synonyms: ["price", "price aed", "unit price", "rate", "price per piece", "aed"] },
  { key: "branch", title: "Branch", hint: "Optional. Must match a branch on the customer. Several branches make one draft each.", synonyms: ["branch", "location", "site", "outlet", "store"] },
  { key: "size", title: "Size or person", hint: "Optional. Matches a measurement set on the customer, or is kept as a note.", synonyms: ["size or person", "size", "person", "staff", "employee", "name", "measurement", "measurements"] },
  { key: "fabric", title: "Fabric", hint: "Optional. Matches a fabric on your list, or is kept as a note.", synonyms: ["fabric", "material", "cloth"] },
  { key: "due", title: "Due date", hint: "Optional. Like 15/11/2026.", synonyms: ["due", "due date", "delivery date", "needed by", "date"] },
  { key: "makeBy", title: "Make by", hint: "Optional. A tailor or stitching unit name.", synonyms: ["make by", "made by", "tailor", "assigned to", "assign", "maker", "unit"] },
  { key: "notes", title: "Notes", hint: "Optional.", synonyms: ["notes", "note", "remarks", "remark", "comments", "comment", "details"] },
];

export type RawCell = string | number | boolean | Date | null | undefined;

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Splits pasted text. Excel and Google Sheets paste tab separated rows. */
export function parsePasted(text: string): RawCell[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  if (lines.some((l) => l.includes("\t"))) return lines.map((l) => l.split("\t"));
  return parseCsv(text);
}

export function parseCsv(text: string): RawCell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Finds the header row and maps columns. Without a header, the template order is assumed. */
export function mapColumns(rows: RawCell[][]): { start: number; map: Partial<Record<BulkField, number>>; headerFound: boolean } {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const map: Partial<Record<BulkField, number>> = {};
    rows[r].forEach((cell, c) => {
      const n = norm(cell);
      if (!n) return;
      const col = BULK_COLUMNS.find((col) => !(col.key in map) && col.synonyms.includes(n));
      if (col) map[col.key] = c;
    });
    if (map.item !== undefined && Object.keys(map).length >= 2) return { start: r + 1, map, headerFound: true };
  }
  return { start: 0, map: Object.fromEntries(BULK_COLUMNS.map((c, i) => [c.key, i])), headerFound: false };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Excel dates arrive as Date, a serial number, or text like 15/11/2026, 2026-11-15, 15 Nov 2026. */
export function toISODate(v: RawCell): string | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? "invalid" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return "invalid";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/);
  if (m && months.includes(m[2])) return valid(+m[3], months.indexOf(m[2]) + 1, +m[1]);
  return "invalid";
}

function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : "invalid";
}

export type Lookups = {
  products: { id: string; name: string; priceFils: number }[];
  fabrics: { id: string; name: string; colour: string | null; shelfLocation: string | null }[];
  tailors: { id: string; name: string }[];
  units: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  measurements: { id: string; label: string }[];
  lastPrices: Record<string, number>;
};

export type BulkRow = {
  rowNumber: number;
  item: string;
  qty: number;
  unitPrice: string;
  productId: string | null;
  branchId: string | null;
  branchName: string;
  measurementId: string | null;
  fabricId: string | null;
  dueDate: string;
  assignment: { type: "tailor" | "unit"; assigneeId: string } | null;
  notes: string;
  cells: Record<BulkField, string>;
  errors: Partial<Record<BulkField, string>>;
  warnings: string[];
};

/** Dates show the way the shop writes them: 15/11/2026. */
const text = (v: RawCell) => {
  if (v instanceof Date) {
    const iso = toISODate(v);
    return iso && iso !== "invalid" ? iso.split("-").reverse().join("/") : "";
  }
  return String(v ?? "").trim();
};

/** Checks every row against the customer's branches and sets, your fabrics, tailors and products. */
export function checkRows(rows: RawCell[][], lookups: Lookups): BulkRow[] {
  const { start, map } = mapColumns(rows);
  const get = (row: RawCell[], f: BulkField) => (map[f] === undefined ? undefined : row[map[f]!]);
  const byName = <T extends { name: string }>(list: T[], v: string) => list.find((x) => norm(x.name) === norm(v));
  const out: BulkRow[] = [];

  rows.slice(start).forEach((row, i) => {
    const cells = Object.fromEntries(BULK_COLUMNS.map((c) => [c.key, text(get(row, c.key))])) as Record<BulkField, string>;
    if (Object.values(cells).every((v) => v === "")) return;
    const errors: BulkRow["errors"] = {};
    const warnings: string[] = [];
    const notes: string[] = cells.notes ? [cells.notes] : [];

    if (!cells.item) errors.item = "Item is empty.";

    const rawQty = get(row, "qty");
    const qtyText = typeof rawQty === "number" ? String(rawQty) : cells.qty.replace(/[^\d.]/g, "");
    const qty = Number(qtyText);
    if (!qtyText) errors.qty = "Qty is empty.";
    else if (!Number.isInteger(qty) || qty < 1) errors.qty = "Whole pieces only, 1 or more.";

    const product = cells.item ? byName(lookups.products, cells.item) : undefined;
    let unitPrice = "";
    const rawPrice = get(row, "price");
    const priceText = typeof rawPrice === "number" ? String(rawPrice) : cells.price.replace(/aed/gi, "").replace(/,/g, "").trim();
    if (priceText) {
      if (!/^\d+(\.\d{1,2})?$/.test(priceText) && !(typeof rawPrice === "number" && rawPrice >= 0)) errors.price = "Use a number like 85 or 85.50.";
      else unitPrice = Number(priceText).toFixed(2);
    } else if (product) {
      const fils = lookups.lastPrices[product.id] ?? product.priceFils;
      if (fils) {
        unitPrice = (fils / 100).toFixed(2);
        warnings.push(lookups.lastPrices[product.id] !== undefined ? `Price taken from last time: ${unitPrice}.` : `Price taken from the product: ${unitPrice}.`);
      }
    }
    if (!unitPrice && !errors.price) warnings.push("No price. It will be 0.00 until you type one.");

    let branchId: string | null = null;
    if (cells.branch) {
      const b = byName(lookups.branches, cells.branch);
      if (b) branchId = b.id;
      else errors.branch = `No branch called "${cells.branch}" on this customer. Add it on the customer page first.`;
    }

    let measurementId: string | null = null;
    if (cells.size) {
      const m = lookups.measurements.find((x) => norm(x.label) === norm(cells.size));
      if (m) measurementId = m.id;
      else {
        notes.push(`Size or person: ${cells.size}`);
        warnings.push(`"${cells.size}" is not a measurement set on this customer. Kept as a note.`);
      }
    }

    let fabricId: string | null = null;
    if (cells.fabric) {
      const f = lookups.fabrics.find((x) => [x.name, [x.name, x.colour].filter(Boolean).join(" ")].some((n) => norm(n) === norm(cells.fabric)));
      if (f) fabricId = f.id;
      else {
        notes.push(`Fabric: ${cells.fabric}`);
        warnings.push(`"${cells.fabric}" is not on your fabric list. Kept as a note.`);
      }
    }

    let dueDate = "";
    if (cells.due || get(row, "due") instanceof Date || typeof get(row, "due") === "number") {
      const d = toISODate(get(row, "due") as RawCell);
      if (d === "invalid") errors.due = "Use a date like 15/11/2026.";
      else dueDate = d ?? "";
    }

    let assignment: BulkRow["assignment"] = null;
    if (cells.makeBy) {
      const t = byName(lookups.tailors, cells.makeBy);
      const u = t ? undefined : byName(lookups.units, cells.makeBy);
      if (t) assignment = { type: "tailor", assigneeId: t.id };
      else if (u) assignment = { type: "unit", assigneeId: u.id };
      else errors.makeBy = `No tailor or stitching unit called "${cells.makeBy}".`;
    }

    out.push({
      rowNumber: start + i + 1,
      item: cells.item,
      qty: Number.isInteger(qty) ? qty : 0,
      unitPrice,
      productId: product?.id ?? null,
      branchId,
      branchName: cells.branch,
      measurementId,
      fabricId,
      dueDate,
      assignment,
      notes: notes.join(". "),
      cells,
      errors,
      warnings,
    });
  });
  return out;
}

/** One group per branch. Rows without a branch form their own group. */
export function groupByBranch(rows: BulkRow[], branches: { id: string; name: string }[]) {
  const groups = new Map<string, { branchId: string | null; label: string; rows: BulkRow[] }>();
  for (const r of rows) {
    const key = r.branchId ?? "";
    if (!groups.has(key)) groups.set(key, { branchId: r.branchId, label: branches.find((b) => b.id === r.branchId)?.name ?? "No branch", rows: [] });
    groups.get(key)!.rows.push(r);
  }
  return [...groups.values()];
}
