import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sql } from "drizzle-orm";
import * as z from "zod/v4";
import { db } from "@/db";
import { formatFils } from "@/lib/money";
import type { VatPeriod } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { FIESTA_MODEL } from "@/lib/fiesta/prompt";
import { vatPack } from "./vat";

/**
 * "Check this quarter" (idea 26). The checks themselves are plain rules over the shop's data, so they are
 * the same every time; Claude only puts them in plain words and orders them. Without Claude the rule text stands.
 */

export type ReviewItem = { key: string; level: "fix" | "check" | "fine"; title: string; text: string; action?: { label: string; href: string } };
export type Review = { summary: string; items: ReviewItem[]; ai: boolean; checkedAt: string };

const n = (v: unknown) => Number(v ?? 0);
const MAX_EACH = 6;

function previous(p: VatPeriod): VatPeriod {
  const [y, m] = p.start.split("-").map(Number);
  const sm = m - 3 <= 0 ? m + 9 : m - 3;
  const sy = m - 3 <= 0 ? y - 1 : y;
  const start = `${sy}-${String(sm).padStart(2, "0")}-01`;
  const end = new Date(`${p.start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start, end: end.toISOString().slice(0, 10), label: "the quarter before" };
}

function swing(now: number, before: number) {
  if (before <= 0 || now <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export async function findings(p: VatPeriod): Promise<{ items: ReviewItem[]; salesNet: number }> {
  const settings = await getSettings();
  const [pack, before, wholesale, delivered, deposits, oddVat, bigCounter] = await Promise.all([
    vatPack(p),
    vatPack(previous(p)),
    db.execute<{ id: string; name: string; invoices: number; net: number }>(sql`
      select c.id, c.name, count(*)::int invoices, sum(i.subtotal_fils)::int net
        from invoices i join customers c on c.id = i.customer_id
        where i.kind = 'tax_invoice' and i.invoice_date between ${p.start} and ${p.end} and c.type = 'wholesale' and coalesce(c.trn, '') = ''
        group by c.id, c.name order by net desc`),
    // The date of supply is the earliest of delivery, invoice and payment: delivered goods owe VAT this quarter.
    db.execute<{ id: string; number: string; name: string; delivered: string; total: number }>(sql`
      select o.id, o.number, c.name, max(d.delivery_date)::text delivered, o.subtotal_fils total
        from delivery_notes d join sales_orders o on o.id = d.order_id join customers c on c.id = o.customer_id
        where d.status = 'delivered' and d.delivery_date between ${p.start} and ${p.end}
          and not exists (select 1 from invoices x where x.order_id = o.id and x.kind = 'tax_invoice' and x.invoice_date <= ${p.end})
        group by o.id, o.number, c.name, o.subtotal_fils order by delivered`),
    db.execute<{ id: string; number: string; name: string; order_id: string; order_number: string | null; amount: number; paid_on: string }>(sql`
      select pay.id, pay.number, c.name, pay.order_id, o.number order_number, pay.amount_fils amount, pay.payment_date::text paid_on
        from payments pay join customers c on c.id = pay.customer_id join sales_orders o on o.id = pay.order_id
        where pay.is_deposit and pay.payment_date between ${p.start} and ${p.end}
          and not exists (select 1 from invoices x where x.order_id = pay.order_id and x.kind = 'tax_invoice' and x.invoice_date <= ${p.end})
        order by pay.payment_date`),
    db.execute<{ id: string; number: string; net: number; vat: number }>(sql`
      select i.id, i.number, i.subtotal_fils net, i.vat_fils vat
        from invoices i
        where i.kind = 'tax_invoice' and i.invoice_date between ${p.start} and ${p.end}
          and abs(i.vat_fils - round(i.subtotal_fils * 0.05)) > (select count(*) from invoice_lines l where l.invoice_id = i.id)`),
    db.execute<{ id: string; number: string; total: number; name: string | null }>(sql`
      select s.id, s.number, s.total_fils total, s.customer_name name from pos_sales s
        where s.sale_date between ${p.start} and ${p.end} and s.total_fils > 1000000 order by s.total_fils desc`),
  ]);

  const out: ReviewItem[] = [];
  if (!/^\d{15}$/.test((settings.trn ?? "").replace(/\s+/g, ""))) {
    out.push({ key: "shop-trn", level: "fix", title: "The shop's TRN is not 15 digits", text: "Every Tax Invoice must carry the shop's TRN. Check it in Settings, Shop.", action: { label: "Open Settings", href: "/settings/shop" } });
  }

  for (const c of wholesale.rows.slice(0, MAX_EACH)) {
    out.push({
      key: `trn-${c.id}`,
      level: "check",
      title: `${c.name} has no TRN`,
      text: `${n(c.invoices)} invoice${n(c.invoices) === 1 ? "" : "s"} this quarter, ${formatFils(n(c.net))} before VAT. If they are VAT registered, their TRN must be on the invoice. Ask them and add it to the customer.`,
      action: { label: "Open customer", href: `/customers/${c.id}` },
    });
  }

  for (const o of delivered.rows.slice(0, MAX_EACH)) {
    out.push({
      key: `deliv-${o.id}`,
      level: "fix",
      title: `${o.number ?? "Order"} delivered but not invoiced`,
      text: `${o.name}, delivered on ${o.delivered}, ${formatFils(n(o.total))} before VAT. VAT is due from the day of delivery, so it belongs in this quarter. Invoice it, or ask your accountant how to include it.`,
      action: { label: "Open order", href: `/orders/${o.id}` },
    });
  }

  for (const d of deposits.rows.slice(0, MAX_EACH)) {
    out.push({
      key: `dep-${d.id}`,
      level: "check",
      title: `Deposit ${d.number} taken before invoicing`,
      text: `${formatFils(n(d.amount))} from ${d.name} on ${d.paid_on}${d.order_number ? ` for ${d.order_number}` : ""}. VAT is due on money received in advance, and it is not in this quarter's boxes yet. Ask your accountant whether to add it.`,
      action: { label: "Open order", href: `/orders/${d.order_id}` },
    });
  }

  for (const b of pack.unclaimed.slice(0, MAX_EACH)) {
    out.push({
      key: `notrn-${b.id}`,
      level: "fix",
      title: `${b.kind} ${b.ref}: VAT without a TRN`,
      text: `${b.party}, ${formatFils(b.vat)} VAT not claimed because the supplier's TRN is missing. If their tax invoice shows a TRN, add it and the VAT counts.`,
      action: { label: b.kind === "Expense" ? "Open expense" : "Open bill", href: b.href },
    });
  }

  for (const i of oddVat.rows.slice(0, MAX_EACH)) {
    out.push({
      key: `vat-${i.id}`,
      level: "check",
      title: `${i.number}: VAT is not 5 percent`,
      text: `${formatFils(n(i.vat))} VAT on ${formatFils(n(i.net))}. Check the VAT on its lines.`,
      action: { label: "Open invoice", href: `/money/invoices/${i.id}` },
    });
  }

  for (const s of bigCounter.rows.slice(0, MAX_EACH)) {
    out.push({
      key: `pos-${s.id}`,
      level: "check",
      title: `Quick sale ${s.number} is over AED 10,000`,
      text: `${formatFils(n(s.total))}${s.name ? ` to ${s.name}` : ""}. A simplified receipt is fine for a walk in. If the buyer is VAT registered, they need a full Tax Invoice.`,
      action: { label: "Open sale", href: `/today/sale/${s.id}` },
    });
  }

  const credits = pack.saleDocs.filter((d) => d.kind === "Credit note");
  if (credits.length) {
    out.push({
      key: "credits",
      level: "fine",
      title: `${credits.length} credit note${credits.length === 1 ? "" : "s"} this quarter`,
      text: `They lower this quarter's sales by ${formatFils(-credits.reduce((s, d) => s + d.net, 0))} and VAT by ${formatFils(-credits.reduce((s, d) => s + d.vat, 0))}. That is right when the credit note is dated in this quarter.`,
      action: { label: "See them", href: `/reports/tax?q=${p.start}&box=1a&doc=credit#docs` },
    });
  }

  const sales = swing(pack.totals.salesNet, before.totals.salesNet);
  if (sales !== null && Math.abs(sales) >= 40) {
    out.push({
      key: "swing-sales",
      level: "check",
      title: `Sales ${sales > 0 ? "up" : "down"} ${Math.abs(sales)} percent on the quarter before`,
      text: `${formatFils(pack.totals.salesNet)} against ${formatFils(before.totals.salesNet)}. Fine if the season explains it. If not, look for a missing or doubled invoice.`,
      action: { label: "Quarter before", href: `/reports/tax?q=${previous(p).start}` },
    });
  }
  const input = swing(pack.totals.inputVat, before.totals.inputVat);
  if (input !== null && Math.abs(input) >= 50) {
    out.push({
      key: "swing-input",
      level: "check",
      title: `VAT you claim ${input > 0 ? "up" : "down"} ${Math.abs(input)} percent`,
      text: `${formatFils(pack.totals.inputVat)} against ${formatFils(before.totals.inputVat)}. A big purchase explains it. Otherwise check for a bill entered twice or missing.`,
      action: { label: "See purchases", href: `/reports/tax?q=${p.start}&box=9#docs` },
    });
  }

  if (!out.some((i) => i.level !== "fine")) {
    out.push({ key: "clean", level: "fine", title: "Nothing to fix", text: "Every check passed. The figures are ready for EmaraTax." });
  }
  const order = { fix: 0, check: 1, fine: 2 };
  return { items: out.sort((a, b) => order[a.level] - order[b.level]), salesNet: pack.totals.salesNet };
}

const Written = z.object({
  summary: z.string(),
  items: z.array(z.object({ key: z.string(), title: z.string(), text: z.string() })),
});

/** The rule results, rewritten by Claude in her words. Keys and buttons always come from the rules. */
export async function reviewQuarter(p: VatPeriod): Promise<Review> {
  const { items, salesNet } = await findings(p);
  const plain = (): Review => {
    const fix = items.filter((i) => i.level === "fix").length;
    const check = items.filter((i) => i.level === "check").length;
    return {
      summary: fix || check ? `${fix} to fix and ${check} to check before you file ${p.label}.` : `${p.label} looks ready to file.`,
      items,
      ai: false,
      checkedAt: new Date().toISOString(),
    };
  };
  if (!process.env.ANTHROPIC_API_KEY) return plain();
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: FIESTA_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Written) },
      system:
        "You review a small Abu Dhabi tailoring shop's quarterly VAT figures before the owner files the VAT 201 return on EmaraTax. You get checks the system already ran. Rewrite each one for the owner: a short title and one or two plain, warm sentences saying what to do. Keep every key, keep the order, keep every amount and number exactly. Do not add new findings or legal claims. Then a one or two sentence summary of how ready the quarter is. No hyphens or dashes as punctuation, no emoji, no accounting jargon.",
      messages: [{ role: "user", content: JSON.stringify({ quarter: p.label, salesBeforeVat: formatFils(salesNet), checks: items.map(({ key, level, title, text }) => ({ key, level, title, text })) }) }],
    });
    const written = res.parsed_output;
    if (!written) return plain();
    const byKey = new Map(written.items.map((w) => [w.key, w]));
    return {
      summary: written.summary,
      items: items.map((i) => {
        const w = byKey.get(i.key);
        return w ? { ...i, title: w.title, text: w.text } : i;
      }),
      ai: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("tax review wording failed", err);
    return plain();
  }
}
