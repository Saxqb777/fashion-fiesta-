import { put } from "@vercel/blob";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { customerBranches, customers, products } from "@/db/schema";
import { auth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import type { ReadDocumentResponse } from "@/lib/document-lines";
import { ReadError, readCustomerDocument, type ReadInput } from "@/lib/read-document";

export const runtime = "nodejs";
// Handwriting and long purchase orders can take a while to read.
export const maxDuration = 300;

/** Vercel accepts request bodies up to 4.5 MB. Photos are shrunk on the phone first. */
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fail = (error: string, status = 400) => NextResponse.json<ReadDocumentResponse>({ ok: false, error }, { status });

const norm = (v: string | null | undefined) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|l l c|sole proprietorship|sp|co|company|the|fze|est|establishment)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Share of words two names have in common. */
function likeness(a: string, b: string) {
  const x = new Set(norm(a).split(" ").filter(Boolean));
  const y = new Set(norm(b).split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.max(x.size, y.size);
}

async function sheetText(file: File) {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return (await file.text()).slice(0, 200_000);
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  return sheets
    .map((s) => `Sheet: ${s.sheet}\n${s.data.map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).join("\t")).join("\n")}`)
    .join("\n\n")
    .slice(0, 200_000);
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "owner") return fail("Sign in as an owner.", 401);

  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "quote" ? "quote" : "order";
  const pickedId = String(form.get("customerId") ?? "");
  if (!(file instanceof File) || !file.size) return fail("Choose a file.");
  if (file.size > MAX_BYTES) return fail("That file is over 4 MB. Take a photo of it instead, or save the PDF smaller.", 413);

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = (IMAGE_TYPES as readonly string[]).includes(file.type);
  const isSheet = file.type === XLSX || file.type === "text/csv" || /\.(xlsx|csv)$/i.test(file.name);
  if (!isPdf && !isImage && !isSheet) return fail("Use a PDF, a photo or screenshot, or an Excel .xlsx file.");

  let input: ReadInput;
  try {
    if (isPdf) input = { kind: "pdf", base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
    else if (isImage) input = { kind: "image", base64: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type as (typeof IMAGE_TYPES)[number] };
    else input = { kind: "text", text: await sheetText(file) };
  } catch {
    return fail("That file could not be opened. Save it as PDF or .xlsx and try again.");
  }

  const [customerList, branchList, productList] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, tier: customers.tier, type: customers.type, phone: customers.phone })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(asc(customers.name)),
    /^[0-9a-f-]{36}$/.test(pickedId)
      ? db
          .select({ name: customerBranches.name })
          .from(customerBranches)
          .where(and(eq(customerBranches.customerId, pickedId), isNull(customerBranches.deletedAt)))
      : Promise.resolve([]),
    db.select({ name: products.name }).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.name)).limit(400),
  ]);

  // Keep the customer's file with the order, whatever the reading finds.
  const name = file.name || (isImage ? "photo.jpg" : "document");
  const blob = await put(`documents/${name}`, file, { access: "public", addRandomSuffix: true, contentType: file.type || undefined });

  let reading;
  try {
    reading = await readCustomerDocument(input, {
      mode,
      today: todayISO(),
      customers: customerList.map((c) => c.name),
      branches: branchList.map((b) => b.name),
      products: productList.map((p) => p.name),
    });
  } catch (e) {
    if (e instanceof ReadError) return fail(e.message, 422);
    console.error("read-document failed", e);
    return fail("Could not read it right now. Try again in a minute, or add the lines by hand.", 502);
  }

  const exact = customerList.find((c) => norm(c.name) === norm(reading.customer_match) || norm(c.name) === norm(reading.customer_as_written));
  let customer = exact ?? null;
  if (!customer && reading.customer_as_written) {
    const best = customerList.map((c) => ({ c, s: likeness(c.name, reading.customer_as_written!) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.6) customer = best.c;
  }

  return NextResponse.json<ReadDocumentResponse>({ ok: true, file: { url: blob.url, name }, reading, customer });
}
