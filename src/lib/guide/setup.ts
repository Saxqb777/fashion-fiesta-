import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, fabrics, products, suppliers, users } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { SETUP_ORDER, SETUP_TOURS, type SetupKey } from "./tours";

/**
 * What the shop still needs before everything works, worked out from the data itself, so a step
 * ticks the moment it is filled in, from the guide or by hand. Skipping a step only means "later".
 */
export type SetupStep = { key: SetupKey; title: string; why: string; href: string; done: boolean; missing: string[] };

const WHY: Record<SetupKey, { why: string; href: string }> = {
  shop: { why: "Prints on every quote, invoice and receipt.", href: "/settings/shop" },
  money: { why: "Bank details for customers to pay you, the VAT quarter, and the trade licence for e-invoices.", href: "/settings/money" },
  team: { why: "Tailors get their work on their phones; your phone is used for WhatsApp.", href: "/settings/team" },
  suppliers: { why: "To buy fabric, send work to stitching units and pay the delivery company.", href: "/purchases/suppliers" },
  catalogue: { why: "Order lines fill in from your products; tailors find the right roll.", href: "/orders/products" },
  customers: { why: "Their TRN and address print on Tax Invoices.", href: "/customers" },
  opening: { why: "So the cash, who owes you and who you owe start from the real numbers.", href: "/settings/opening" },
};

export async function setupSteps(): Promise<SetupStep[]> {
  const s = await getSettings();
  const [owners, [tailors], [supplierCount], [productCount], [fabricCount], [customerCount], [wholesaleNoTrn]] = await Promise.all([
    db.select({ name: users.name, phone: users.phone }).from(users).where(and(eq(users.role, "owner"), eq(users.isActive, true), isNull(users.deletedAt))),
    db.select({ n: count() }).from(users).where(and(eq(users.role, "tailor"), eq(users.isActive, true), isNull(users.deletedAt))),
    db.select({ n: count() }).from(suppliers).where(isNull(suppliers.deletedAt)),
    db.select({ n: count() }).from(products).where(and(isNull(products.deletedAt), ne(products.priceFils, 0))),
    db.select({ n: count() }).from(fabrics).where(isNull(fabrics.deletedAt)),
    db.select({ n: count() }).from(customers).where(isNull(customers.deletedAt)),
    db.select({ n: count() }).from(customers).where(and(isNull(customers.deletedAt), eq(customers.type, "wholesale"), isNull(customers.trn))),
  ]);
  const has = (v: string | null | undefined) => Boolean(v && v.trim());
  const missing: Record<SetupKey, string[]> = {
    shop: [
      !has(s.legalName) && "legal name",
      !has(s.address) && "address",
      !/^\d{15}$/.test((s.trn ?? "").replace(/\s+/g, "")) && "TRN",
      !has(s.phone) && "shop phone",
      !has(s.email) && "shop email",
    ].filter(Boolean) as string[],
    money: [!has(s.bankName) && "bank name", !has(s.iban) && "IBAN", !has(s.tradeLicense) && "trade licence"].filter(Boolean) as string[],
    team: [
      !tailors.n && "at least one tailor",
      ...owners.filter((o) => !has(o.phone)).map((o) => `${o.name}'s phone`),
    ].filter(Boolean) as string[],
    suppliers: [!supplierCount.n && "at least one supplier"].filter(Boolean) as string[],
    catalogue: [!productCount.n && "products with a price", !fabricCount.n && "fabrics"].filter(Boolean) as string[],
    customers: [!customerCount.n && "customers"].filter(Boolean) as string[],
    opening: [!s.openingDate && "opening balances"].filter(Boolean) as string[],
  };
  return SETUP_ORDER.map((key) => {
    const extra = key === "customers" && wholesaleNoTrn.n ? [`${wholesaleNoTrn.n} business ${wholesaleNoTrn.n === 1 ? "customer has" : "customers have"} no TRN yet (fine if not VAT registered)`] : [];
    return { key, title: SETUP_TOURS[key].title, ...WHY[key], done: missing[key].length === 0, missing: [...missing[key], ...(missing[key].length ? [] : extra)] };
  });
}
