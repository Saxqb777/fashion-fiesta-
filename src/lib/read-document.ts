import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DocumentReadingSchema, type DocumentReading } from "./document-lines";

export const READ_MODEL = "claude-opus-5-5";

const SYSTEM = `You read documents that a ladies tailoring and uniform shop in Abu Dhabi receives from its customers: purchase orders, the customer's own quotes, handwritten order slips, WhatsApp screenshots and spreadsheets. Extract what the customer wants made or supplied, so the shop owner can check it and turn it into an order.

Rules:
- Report only what the document shows. Never guess a quantity, price, size or name. Use null when something is not there. When you can read something but are not certain (handwriting, blur, cut off), still give your best reading and list that field in "unsure".
- One line per item per branch. When the same item goes to several branches, sites or locations, make one line per branch with that branch's quantity.
- description: the item as the customer names it, in short English, for example "Spa tunic, embroidered logo". When the document is in Arabic, translate the item and put the Arabic wording in notes. When the item is clearly one of the shop's known products listed below, use that product name exactly.
- quantity: total pieces for the line, as a whole number.
- sizes: the size breakdown when the document gives one, keeping the customer's size labels exactly (S, M, XL, 38, 40, Small). Leave empty when there is no breakdown.
- people: when the document names staff, students or other people, one entry per person with their size, quantity (null when not stated) and any personal note such as sleeve length or height. Leave empty when no names are given.
- unit_price: the price per piece as a number. price_includes_vat: true when the document says the price includes VAT, false when it says VAT is extra or excluded, null when it does not say.
- branch: the customer's branch, site or location for that line, or null. When it matches one of the known branches listed below, use that exact spelling.
- customer_as_written: the customer's name as it appears. customer_match: when the customer is one of the known customers listed below, return that exact name, otherwise null. The shop itself is Fashion Fiesta; never return Fashion Fiesta as the customer.
- customer_po_number: the customer's own purchase order or reference number, not a number issued by Fashion Fiesta.
- Dates as YYYY-MM-DD. document_date is the date on the document; required_by is the delivery or needed by date. When a date is written without a year, use the next time that day and month comes on or after today's date, given below.
- remarks: short plain sentences the owner should know, for example "Page 2 is cut off" or "Logo embroidery is requested on all tunics". Do not use hyphens or dashes in anything you write.
- readable: false when the file is not an order, quote or request for garments at all, with the reason in remarks.`;

export type ReadInput =
  | { kind: "pdf"; base64: string }
  | { kind: "image"; base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }
  | { kind: "text"; text: string };

export type ReadContext = {
  customers: string[];
  branches: string[];
  products: string[];
  mode: "order" | "quote";
  today: string;
};

export class ReadError extends Error {}

export async function readCustomerDocument(input: ReadInput, ctx: ReadContext): Promise<DocumentReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ReadError("Reading documents is not switched on yet.");
  const client = new Anthropic();

  const file: Anthropic.Beta.BetaContentBlockParam =
    input.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } }
      : input.kind === "image"
        ? { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } }
        : { type: "text", text: `The customer's spreadsheet, one row per line, cells separated by tabs:\n\n${input.text}` };

  const known = [
    `Today is ${ctx.today} in Abu Dhabi. The owner is making a ${ctx.mode === "order" ? "sales order" : "quote"} from this document.`,
    ctx.customers.length ? `Known customers:\n${ctx.customers.join("\n")}` : "No known customers yet.",
    ctx.branches.length ? `Known branches of the customer the owner already picked:\n${ctx.branches.join("\n")}` : "",
    ctx.products.length ? `The shop's known products:\n${ctx.products.join("\n")}` : "",
    "Read the document and fill in the order details.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = client.beta.messages.stream({
    model: READ_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(DocumentReadingSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: [file, { type: "text", text: known }] }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new ReadError("Claude could not read this document. Add the lines by hand or from Excel.");
  if (message.stop_reason === "max_tokens") throw new ReadError("The document is too long to read in one go. Split it, or use Add lines from Excel.");
  const text = message.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "");
  } catch {
    throw new ReadError("Could not read it. Add the lines by hand or from Excel.");
  }
  const parsed = DocumentReadingSchema.safeParse(raw);
  if (!parsed.success) throw new ReadError("Could not read it. Add the lines by hand or from Excel.");
  console.info(`read-document: ${message.model}, ${message.usage.input_tokens} in, ${message.usage.output_tokens} out, ${parsed.data.lines.length} lines`);
  return parsed.data;
}
