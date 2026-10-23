import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { VatPeriod } from "@/lib/reports";

/**
 * The VAT 201 return for one quarter, box by box, with every document behind each box.
 * Every standard rated sale goes in box 1a, Abu Dhabi: the shop's fixed establishment.
 * The emirate a sale was delivered to is kept only as a filter when looking at the documents.
 */

export type SaleDoc = { kind: "Tax invoice" | "Credit note" | "Quick sale"; id: string; ref: string; date: string; party: string; emirate: string; net: number; vat: number; href: string };
export type PurchaseDoc = { kind: "Supplier bill" | "Expense"; id: string; ref: string; date: string; party: string; trn: string | null; net: number; vat: number; claimable: boolean; href: string };

export type BoxKey = "1a" | "1b" | "1c" | "1d" | "1e" | "1f" | "1g" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14";
export type Box = { box: BoxKey; label: string; amount: number | null; vat: number | null; adjustment?: number; section: "sales" | "purchases" | "net"; docs: "sales" | "purchases" | null };

const n = (v: unknown) => Number(v ?? 0);

export async function vatPack(p: VatPeriod) {
  const [sales, purchases] = await Promise.all([
    db.execute<SaleDoc>(sql`
      select 'Tax invoice' kind, i.id, i.number ref, i.invoice_date::text date, c.name party, coalesce(b.emirate, 'Abu Dhabi') emirate, i.subtotal_fils net, i.vat_fils vat, '/money/invoices/' || i.id href
        from invoices i join customers c on c.id = i.customer_id left join customer_branches b on b.id = i.branch_id
        where i.kind = 'tax_invoice' and i.invoice_date between ${p.start} and ${p.end}
      union all
      select 'Credit note', cn.id, cn.number, cn.credit_date::text, c.name, coalesce(b.emirate, 'Abu Dhabi'), -cn.subtotal_fils, -cn.vat_fils, '/money/invoices/' || cn.invoice_id
        from credit_notes cn join invoices i on i.id = cn.invoice_id join customers c on c.id = cn.customer_id left join customer_branches b on b.id = i.branch_id
        where cn.credit_date between ${p.start} and ${p.end}
      union all
      select 'Quick sale', s.id, s.number, s.sale_date::text, coalesce(s.customer_name, 'Walk in'), 'Abu Dhabi', s.subtotal_fils, s.vat_fils, '/today/sale/' || s.id
        from pos_sales s where s.sale_date between ${p.start} and ${p.end}
      order by 4, 3`),
    db.execute<PurchaseDoc & { trn: string | null }>(sql`
      select 'Supplier bill' kind, b.id, coalesce(b.bill_number, 'No number') ref, b.bill_date::text date, s.name party, coalesce(nullif(b.supplier_trn, ''), nullif(s.trn, '')) trn,
          b.subtotal_fils net, b.vat_fils vat, '/purchases/bills/' || b.id href
        from supplier_bills b join suppliers s on s.id = b.supplier_id
        where b.kind = 'bill' and b.vat_fils > 0 and b.bill_date between ${p.start} and ${p.end}
      union all
      select 'Expense', e.id, e.description, e.expense_date::text, coalesce(nullif(e.payee, ''), 'No payee'), nullif(e.payee_trn, ''), e.amount_fils - e.vat_fils, e.vat_fils, '/money/expenses/' || e.id
        from expenses e where e.vat_fils > 0 and e.expense_date between ${p.start} and ${p.end}
      order by 4, 3`),
  ]);
  const saleDocs = sales.rows.map((r) => ({ ...r, net: n(r.net), vat: n(r.vat) }));
  // Input VAT is recoverable only with a tax invoice that carries the supplier's TRN.
  const purchaseDocs = purchases.rows.map((r) => ({ ...r, net: n(r.net), vat: n(r.vat), claimable: Boolean(r.trn) }));
  const out = { net: saleDocs.reduce((s, r) => s + r.net, 0), vat: saleDocs.reduce((s, r) => s + r.vat, 0) };
  const claim = purchaseDocs.filter((d) => d.claimable);
  const inp = { net: claim.reduce((s, r) => s + r.net, 0), vat: claim.reduce((s, r) => s + r.vat, 0) };
  const unclaimed = purchaseDocs.filter((d) => !d.claimable);
  const due = out.vat - inp.vat;
  const emirate = (box: BoxKey, label: string): Box => ({ box, label: `Standard rated supplies in ${label}`, amount: 0, vat: 0, adjustment: 0, section: "sales", docs: null });
  const boxes: Box[] = [
    { box: "1a", label: "Standard rated supplies in Abu Dhabi", amount: out.net, vat: out.vat, adjustment: 0, section: "sales", docs: "sales" },
    emirate("1b", "Dubai"),
    emirate("1c", "Sharjah"),
    emirate("1d", "Ajman"),
    emirate("1e", "Umm Al Quwain"),
    emirate("1f", "Ras Al Khaimah"),
    emirate("1g", "Fujairah"),
    { box: "2", label: "Tax refunds provided to tourists", amount: 0, vat: 0, section: "sales", docs: null },
    { box: "3", label: "Supplies subject to the reverse charge", amount: 0, vat: 0, section: "sales", docs: null },
    { box: "4", label: "Zero rated supplies", amount: 0, vat: null, section: "sales", docs: null },
    { box: "5", label: "Exempt supplies", amount: 0, vat: null, section: "sales", docs: null },
    { box: "6", label: "Goods imported into the UAE", amount: 0, vat: 0, section: "sales", docs: null },
    { box: "7", label: "Adjustments to goods imported into the UAE", amount: 0, vat: 0, section: "sales", docs: null },
    { box: "8", label: "Totals", amount: out.net, vat: out.vat, adjustment: 0, section: "sales", docs: "sales" },
    { box: "9", label: "Standard rated expenses", amount: inp.net, vat: inp.vat, adjustment: 0, section: "purchases", docs: "purchases" },
    { box: "10", label: "Supplies subject to the reverse charge", amount: 0, vat: 0, section: "purchases", docs: null },
    { box: "11", label: "Totals", amount: inp.net, vat: inp.vat, adjustment: 0, section: "purchases", docs: "purchases" },
    { box: "12", label: "Total value of due tax for the period", amount: null, vat: out.vat, section: "net", docs: null },
    { box: "13", label: "Total value of recoverable tax for the period", amount: null, vat: inp.vat, section: "net", docs: null },
    { box: "14", label: due >= 0 ? "Payable tax for the period" : "Refundable tax for the period", amount: null, vat: due, section: "net", docs: null },
  ];
  return { boxes, saleDocs, purchaseDocs, unclaimed, totals: { salesNet: out.net, outputVat: out.vat, purchasesNet: inp.net, inputVat: inp.vat, due } };
}

export type VatPack = Awaited<ReturnType<typeof vatPack>>;

/** The day the return and payment are due: the 28th day after the quarter ends. */
export function dueDateFor(p: VatPeriod) {
  const d = new Date(`${p.end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 28);
  return d.toISOString().slice(0, 10);
}
