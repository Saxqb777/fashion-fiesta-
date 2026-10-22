import type { DocumentType } from "@/db/schema";

export const DEFAULT_COMPANY = {
  tradeName: "Fashion Fiesta",
  legalName: "FASHION FIESTA LADIES TAILORING & TEXTILES SOLE PROPRIETORSHIP L.L.C",
  address: "Shabiya 12, Mussafah, Abu Dhabi, United Arab Emirates",
  trn: "100545592600003",
  currency: "AED",
  vatRateBp: 500,
  defaultCreditDays: 30,
  embroideryShopSharePercent: 50,
};

export const DOCUMENT_TYPES: ReadonlyArray<{
  type: DocumentType;
  label: string;
  prefix: string;
}> = [
  { type: "quote", label: "Quote", prefix: "FF-Q" },
  { type: "sales_order", label: "Sales Order", prefix: "FF-SO" },
  { type: "delivery_note", label: "Delivery Note", prefix: "FF-DN" },
  { type: "invoice", label: "Tax Invoice", prefix: "FF-INV" },
  { type: "receipt", label: "Receipt", prefix: "FF-RCT" },
  { type: "credit_note", label: "Credit Note", prefix: "FF-CN" },
  { type: "purchase_order", label: "Purchase Order", prefix: "FF-PO" },
  { type: "pos_sale", label: "Quick sale (Simplified Tax Invoice)", prefix: "FF-POS" },
];

export const DEFAULT_SEQUENCES = DOCUMENT_TYPES.map((d) => ({
  docType: d.type,
  prefix: d.prefix,
  nextNumber: 1001,
  padding: 4,
}));

export const SETUP_STEPS = ["account", "shop", "money", "numbering", "team", "opening"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const TIME_ZONE = "Asia/Dubai";
