import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditNoteLines, creditNotes, customerBranches, customers, invoiceLines, invoices } from "@/db/schema";
import type { VatPeriod } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

/**
 * E-invoicing readiness (idea 28): each Tax Invoice and Credit Note as a Peppol PINT AE UBL file,
 * so an accredited service provider can be connected before e-invoicing starts for the shop.
 * Values follow PINT AE 1.0.1: billing-1@ae-1, transaction flags 00000000 (no special case),
 * endpoint scheme 0235 (UAE TIN), emirate codes, credit note reason codes. The provider validates the final file.
 */

const EMIRATE: Record<string, string> = { "abu dhabi": "AUH", dubai: "DXB", sharjah: "SHJ", ajman: "AJM", "umm al quwain": "UAQ", "ras al khaimah": "RAK", fujairah: "FUJ" };
export const emirateCode = (name: string | null | undefined) => (name ? (EMIRATE[name.trim().toLowerCase()] ?? null) : null);

const trnOk = (v: string | null | undefined) => /^1\d{12}03$/.test((v ?? "").replace(/\s+/g, ""));
const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "");
/** The UAE TIN is the first 10 digits of the 15 digit TRN. It is the Peppol address (scheme 0235). */
const tin = (trn: string | null | undefined) => clean(trn).slice(0, 10);

const esc = (v: string | number | null | undefined) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const money = (fils: number) => (fils / 100).toFixed(2);
const amt = (tag: string, fils: number) => `<cbc:${tag} currencyID="AED">${money(fils)}</cbc:${tag}>`;

export type Issue = { level: "missing" | "check"; text: string; tag?: string };
export type EDoc = { kind: "invoice" | "credit"; id: string; number: string; date: string; customer: string; total: number; href: string; issues: Issue[] };

type Shop = Awaited<ReturnType<typeof getSettings>>;

/** What stops the shop's own details from going out on any e-invoice. */
export function sellerIssues(s: Shop): Issue[] {
  const out: Issue[] = [];
  if (!trnOk(s.trn)) out.push({ level: "missing", text: "The shop's TRN is not 15 digits starting with 1 and ending with 03. Settings, Shop." });
  if (!s.tradeLicense) out.push({ level: "missing", text: "Trade licence number. Settings, Money." });
  if (!s.tradeLicenseAuthority) out.push({ level: "check", text: "Who issued the trade licence. Settings, Money." });
  if (!s.address) out.push({ level: "missing", text: "The shop's address. Settings, Shop." });
  return out;
}

function buyerIssues(b: { trn: string | null; address: string | null; emirate: string | null }): Issue[] {
  const out: Issue[] = [];
  if (!b.trn) out.push({ level: "check", tag: "No customer TRN", text: "No customer TRN. Fine if they are not VAT registered; then it is not a business to business e-invoice." });
  else if (!trnOk(b.trn)) out.push({ level: "missing", tag: "TRN not valid", text: "The customer's TRN is not 15 digits starting with 1 and ending with 03." });
  if (!b.address) out.push({ level: "missing", tag: "No address", text: "Customer or branch address." });
  if (!emirateCode(b.emirate)) out.push({ level: "check", tag: "No emirate", text: b.emirate ? `Emirate "${b.emirate}" is not one of the seven. Abu Dhabi is used.` : "No emirate on the branch. Abu Dhabi is used." });
  return out;
}

/** Every Tax Invoice and Credit Note in the quarter, with what is missing for an e-invoice. */
export async function einvoiceDocs(p: VatPeriod): Promise<EDoc[]> {
  const res = await db.execute<{ kind: "invoice" | "credit"; id: string; number: string; date: string; customer: string; total: number; trn: string | null; address: string | null; emirate: string | null; lines: number; href: string }>(sql`
    select 'invoice' kind, i.id, i.number, i.invoice_date::text date, c.name customer, i.total_fils total, nullif(c.trn, '') trn,
        coalesce(nullif(b.address, ''), nullif(c.address, '')) address, b.emirate,
        (select count(*) from invoice_lines l where l.invoice_id = i.id)::int lines, '/money/invoices/' || i.id href
      from invoices i join customers c on c.id = i.customer_id left join customer_branches b on b.id = i.branch_id
      where i.kind = 'tax_invoice' and i.invoice_date between ${p.start} and ${p.end}
    union all
    select 'credit', cn.id, cn.number, cn.credit_date::text, c.name, -cn.total_fils, nullif(c.trn, ''),
        coalesce(nullif(b.address, ''), nullif(c.address, '')), b.emirate,
        (select count(*) from credit_note_lines l where l.credit_note_id = cn.id)::int, '/money/invoices/' || cn.invoice_id
      from credit_notes cn join invoices i on i.id = cn.invoice_id join customers c on c.id = cn.customer_id left join customer_branches b on b.id = i.branch_id
      where cn.credit_date between ${p.start} and ${p.end}
    order by 4, 3`);
  return res.rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    number: r.number,
    date: r.date,
    customer: r.customer,
    total: Number(r.total),
    href: r.href,
    issues: [...buyerIssues(r), ...(Number(r.lines) ? [] : [{ level: "missing" as const, tag: "No lines", text: "No lines." }])],
  }));
}

function party(o: { trn: string | null; name: string; street: string; city: string; emirate: string; phone?: string | null; email?: string | null; license?: string | null; authority?: string | null }) {
  return [
    `<cac:Party>`,
    o.trn ? `<cbc:EndpointID schemeID="0235">${esc(tin(o.trn))}</cbc:EndpointID>` : "",
    `<cac:PartyName><cbc:Name>${esc(o.name)}</cbc:Name></cac:PartyName>`,
    `<cac:PostalAddress><cbc:StreetName>${esc(o.street)}</cbc:StreetName><cbc:CityName>${esc(o.city)}</cbc:CityName><cbc:CountrySubentity>${o.emirate}</cbc:CountrySubentity><cac:Country><cbc:IdentificationCode>AE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`,
    o.trn ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(clean(o.trn))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "",
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(o.name)}</cbc:RegistrationName>${o.license ? `<cbc:CompanyID schemeAgencyID="TL"${o.authority ? ` schemeAgencyName="${esc(o.authority)}"` : ""}>${esc(o.license)}</cbc:CompanyID>` : ""}</cac:PartyLegalEntity>`,
    o.phone || o.email ? `<cac:Contact>${o.phone ? `<cbc:Telephone>${esc(o.phone)}</cbc:Telephone>` : ""}${o.email ? `<cbc:ElectronicMail>${esc(o.email)}</cbc:ElectronicMail>` : ""}</cac:Contact>` : "",
    `</cac:Party>`,
  ].join("");
}

function seller(s: Shop) {
  const street = s.address.replace(/,?\s*(Abu Dhabi.*|United Arab Emirates)$/i, "").trim() || s.address;
  return `<cac:AccountingSupplierParty>${party({ trn: s.trn, name: s.legalName, street, city: "Abu Dhabi", emirate: "AUH", phone: s.phone, email: s.email, license: s.tradeLicense, authority: s.tradeLicenseAuthority })}</cac:AccountingSupplierParty>`;
}

async function buyer(customerId: string, branchId: string | null) {
  const [c, b] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, customerId) }),
    branchId ? db.query.customerBranches.findFirst({ where: eq(customerBranches.id, branchId) }) : undefined,
  ]);
  const code = emirateCode(b?.emirate) ?? "AUH";
  const city = Object.entries(EMIRATE).find(([, v]) => v === code)![0].replace(/\b\w/g, (x) => x.toUpperCase());
  return `<cac:AccountingCustomerParty>${party({ trn: c?.trn || null, name: c?.name ?? "Customer", street: b?.address || c?.address || city, city, emirate: code, phone: b?.phone ?? c?.phone, email: c?.email })}</cac:AccountingCustomerParty>`;
}

const S = `<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`;
const taxTotal = (net: number, vat: number) => `<cac:TaxTotal>${amt("TaxAmount", vat)}<cac:TaxSubtotal>${amt("TaxableAmount", net)}${amt("TaxAmount", vat)}${S}</cac:TaxSubtotal></cac:TaxTotal>`;
const totals = (net: number, vat: number) =>
  `<cac:LegalMonetaryTotal>${amt("LineExtensionAmount", net)}${amt("TaxExclusiveAmount", net)}${amt("TaxInclusiveAmount", net + vat)}${amt("PayableAmount", net + vat)}</cac:LegalMonetaryTotal>`;

function line(tag: "InvoiceLine" | "CreditNoteLine", i: number, l: { description: string; qty: number; unitPriceFils: number; netFils: number; vatFils: number }) {
  const q = tag === "InvoiceLine" ? "InvoicedQuantity" : "CreditedQuantity";
  return [
    `<cac:${tag}><cbc:ID>${i + 1}</cbc:ID><cbc:${q} unitCode="H87">${l.qty}</cbc:${q}>${amt("LineExtensionAmount", l.netFils)}`,
    `<cac:Item><cbc:Description>${esc(l.description)}</cbc:Description><cbc:Name>${esc(l.description.slice(0, 100))}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`,
    `<cac:Price>${amt("PriceAmount", l.unitPriceFils)}</cac:Price>`,
    `<cac:ItemPriceExtension>${amt("Amount", l.netFils + l.vatFils)}<cac:TaxTotal>${amt("TaxAmount", l.vatFils)}</cac:TaxTotal></cac:ItemPriceExtension>`,
    `</cac:${tag}>`,
  ].join("");
}

const NS = `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"`;
const HEAD = `<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID><cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID><cbc:ProfileExecutionID>00000000</cbc:ProfileExecutionID>`;

function pretty(xml: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml.replace(/></g, ">\n<")}\n`;
}

export async function invoiceXml(id: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.kind !== "tax_invoice" || !inv.number) return null;
  const [s, lines, buy] = await Promise.all([getSettings(), db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sort)), buyer(inv.customerId, inv.branchId)]);
  const pay = s.iban
    ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${esc(clean(s.iban))}</cbc:ID>${s.accountName ? `<cbc:Name>${esc(s.accountName)}</cbc:Name>` : ""}</cac:PayeeFinancialAccount></cac:PaymentMeans>`
    : `<cac:PaymentMeans><cbc:PaymentMeansCode>1</cbc:PaymentMeansCode></cac:PaymentMeans>`;
  const xml = [
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ${NS}>`,
    HEAD,
    `<cbc:ID>${esc(inv.number)}</cbc:ID><cbc:UUID>${inv.id}</cbc:UUID><cbc:IssueDate>${inv.invoiceDate}</cbc:IssueDate><cbc:DueDate>${inv.dueDate}</cbc:DueDate>`,
    `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${inv.notes ? `<cbc:Note>${esc(inv.notes)}</cbc:Note>` : ""}<cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>`,
    inv.customerPoNumber ? `<cbc:BuyerReference>${esc(inv.customerPoNumber)}</cbc:BuyerReference><cac:OrderReference><cbc:ID>${esc(inv.customerPoNumber)}</cbc:ID></cac:OrderReference>` : "",
    seller(s),
    buy,
    pay,
    `<cac:PaymentTerms><cbc:Note>Due by ${inv.dueDate}</cbc:Note></cac:PaymentTerms>`,
    taxTotal(inv.subtotalFils, inv.vatFils),
    totals(inv.subtotalFils, inv.vatFils),
    ...lines.map((l, i) => line("InvoiceLine", i, l)),
    `</Invoice>`,
  ].join("");
  return { filename: `${inv.number}.xml`, xml: pretty(xml) };
}

/** Credit note reason, from the FTA list: cancelled, goods returned, charged in error, else the price changed. */
function reasonCode(reason: string) {
  if (/return/i.test(reason)) return "DL8.61.1.D";
  if (/cancel/i.test(reason)) return "DL8.61.1.A";
  if (/error|wrong|mistake|twice|duplicate/i.test(reason)) return "DL8.61.1.E";
  return "DL8.61.1.C";
}

export async function creditNoteXml(id: string) {
  const cn = await db.query.creditNotes.findFirst({ where: eq(creditNotes.id, id) });
  if (!cn) return null;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, cn.invoiceId) });
  if (!inv) return null;
  const [s, lines, buy] = await Promise.all([getSettings(), db.select().from(creditNoteLines).where(eq(creditNoteLines.creditNoteId, id)), buyer(cn.customerId, inv.branchId)]);
  const xml = [
    `<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" ${NS}>`,
    HEAD,
    `<cbc:ID>${esc(cn.number)}</cbc:ID><cbc:UUID>${cn.id}</cbc:UUID><cbc:IssueDate>${cn.creditDate}</cbc:IssueDate>`,
    `<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode><cbc:Note>${esc(cn.reason)}</cbc:Note><cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>`,
    inv.customerPoNumber ? `<cbc:BuyerReference>${esc(inv.customerPoNumber)}</cbc:BuyerReference>` : "",
    `<cac:DiscrepancyResponse><cbc:ResponseCode>${reasonCode(cn.reason)}</cbc:ResponseCode><cbc:Description>${esc(cn.reason)}</cbc:Description></cac:DiscrepancyResponse>`,
    `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(inv.number ?? "")}</cbc:ID><cbc:IssueDate>${inv.invoiceDate}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`,
    seller(s),
    buy,
    taxTotal(cn.subtotalFils, cn.vatFils),
    totals(cn.subtotalFils, cn.vatFils),
    ...lines.map((l, i) => line("CreditNoteLine", i, l)),
    `</CreditNote>`,
  ].join("");
  return { filename: `${cn.number}.xml`, xml: pretty(xml) };
}
