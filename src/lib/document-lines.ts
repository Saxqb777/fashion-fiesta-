/**
 * What Claude reads from a customer's document, and how it becomes order lines.
 * The schema is shared by the server (structured output) and the browser (mapping).
 * Nothing here saves anything.
 */
import { z } from "zod";

export const UNSURE_FIELDS = ["description", "quantity", "unit_price", "branch", "sizes", "people"] as const;

export const DocumentLineSchema = z.object({
  description: z.string(),
  quantity: z.number().int().nullable(),
  unit_price: z.number().nullable(),
  price_includes_vat: z.boolean().nullable(),
  branch: z.string().nullable(),
  sizes: z.array(z.object({ size: z.string(), quantity: z.number().int() })),
  people: z.array(z.object({ name: z.string(), size: z.string().nullable(), quantity: z.number().int().nullable(), note: z.string().nullable() })),
  notes: z.string().nullable(),
  unsure: z.array(z.enum(UNSURE_FIELDS)),
});

export const DocumentReadingSchema = z.object({
  readable: z.boolean(),
  document_kind: z.enum(["customer_po", "quote", "handwritten_note", "message_screenshot", "spreadsheet", "other"]),
  customer_as_written: z.string().nullable(),
  customer_match: z.string().nullable(),
  customer_po_number: z.string().nullable(),
  document_date: z.string().nullable(),
  required_by: z.string().nullable(),
  lines: z.array(DocumentLineSchema),
  remarks: z.array(z.string()),
});

export type DocumentLine = z.infer<typeof DocumentLineSchema>;
export type DocumentReading = z.infer<typeof DocumentReadingSchema>;

export type ReadDocumentResponse =
  | {
      ok: true;
      file: { url: string; name: string };
      reading: DocumentReading;
      customer: { id: string; name: string; tier: "vip" | "regular" | "new"; type: "retail" | "wholesale"; phone: string | null } | null;
    }
  | { ok: false; error: string };

export type DocRow = {
  key: string;
  description: string;
  productId: string | null;
  qty: string;
  unitPrice: string;
  branchId: string | null;
  branchText: string;
  notes: string;
  /** Plain sentences shown under the line: what to check. */
  issues: string[];
  /** Fields that must be filled or fixed before saving. */
  unsure: ("description" | "qty" | "unitPrice" | "branch")[];
};

const norm = (v: string | null | undefined) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let n = 0;
const key = () => `d${Date.now().toString(36)}${(n++).toString(36)}`;

/** Sizes and names, one per line, so a tailor can read them at a glance. */
export function structuredNotes(l: DocumentLine) {
  const parts: string[] = [];
  if (l.sizes.length) parts.push(`Sizes: ${l.sizes.map((s) => `${s.size} ${s.quantity}`).join(", ")}`);
  if (l.people.length) {
    parts.push(
      ["Names:", ...l.people.map((p) => `${p.name}: ${[p.size, p.quantity && p.quantity > 1 ? `${p.quantity} pieces` : null, p.note].filter(Boolean).join(", ") || "no size given"}`)].join("\n"),
    );
  }
  if (l.notes?.trim()) parts.push(l.notes.trim());
  return parts.join("\n");
}

export function matchBranch(text: string | null, branches: { id: string; name: string }[]) {
  const t = norm(text);
  if (!t) return null;
  return branches.find((b) => norm(b.name) === t) ?? branches.find((b) => norm(b.name).includes(t) || t.includes(norm(b.name))) ?? null;
}

/** Turns what was read into editor rows. Prices are always before VAT. */
export function toDocRows(
  reading: DocumentReading,
  look: {
    products: { id: string; name: string; priceFils: number }[];
    branches: { id: string; name: string }[];
    lastPrices: Record<string, number>;
    vatRateBp: number;
  },
): DocRow[] {
  return reading.lines.map((l) => {
    const issues: string[] = [];
    const unsure: DocRow["unsure"] = [];
    const product = look.products.find((p) => norm(p.name) === norm(l.description));

    const sizeTotal = l.sizes.reduce((s, x) => s + x.quantity, 0);
    const peopleTotal = l.people.reduce((s, p) => s + (p.quantity ?? 1), 0);
    let qty = l.quantity;
    if (!qty && sizeTotal) {
      qty = sizeTotal;
      issues.push("Quantity worked out from the sizes.");
    } else if (!qty && peopleTotal) {
      qty = peopleTotal;
      issues.push("Quantity worked out from the names.");
    }
    if (!qty) {
      unsure.push("qty");
      issues.push("No quantity on the document.");
    } else if (sizeTotal && sizeTotal !== qty) issues.push(`Sizes add up to ${sizeTotal}, the quantity says ${qty}.`);
    else if (!sizeTotal && peopleTotal && peopleTotal !== qty) issues.push(`Names add up to ${peopleTotal}, the quantity says ${qty}.`);

    let unitPrice = "";
    if (l.unit_price !== null && l.unit_price >= 0) {
      if (l.price_includes_vat) {
        const net = Math.round((l.unit_price * 10000 * 100) / (10000 + look.vatRateBp)) / 100;
        unitPrice = net.toFixed(2);
        issues.push(`The document price ${l.unit_price.toFixed(2)} includes VAT. Shown before VAT.`);
      } else unitPrice = l.unit_price.toFixed(2);
    } else if (product) {
      const fils = look.lastPrices[product.id] ?? product.priceFils;
      if (fils) {
        unitPrice = (fils / 100).toFixed(2);
        issues.push(look.lastPrices[product.id] !== undefined ? "No price on the document. Their last price is used." : "No price on the document. The product price is used.");
      }
    }
    if (!unitPrice) {
      unsure.push("unitPrice");
      issues.push("No price on the document.");
    }

    const branch = matchBranch(l.branch, look.branches);
    if (l.branch && !branch) {
      unsure.push("branch");
      issues.push(`No branch called "${l.branch}" on this customer. Add it on the customer page, or it goes on the order without a branch.`);
    }

    if (l.unsure.includes("description")) {
      unsure.push("description");
      issues.push("The item name was hard to read.");
    }
    if (l.unsure.includes("quantity") && qty) {
      unsure.push("qty");
      issues.push("The quantity was hard to read.");
    }
    if (l.unsure.includes("unit_price") && unitPrice) {
      unsure.push("unitPrice");
      issues.push("The price was hard to read.");
    }
    if (l.unsure.includes("sizes") || l.unsure.includes("people")) issues.push("Some sizes or names were hard to read.");

    return {
      key: key(),
      description: product?.name ?? l.description,
      productId: product?.id ?? null,
      qty: qty ? String(qty) : "",
      unitPrice,
      branchId: branch?.id ?? null,
      branchText: l.branch ?? "",
      notes: structuredNotes(l),
      issues,
      unsure,
    };
  });
}
