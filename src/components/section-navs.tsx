import { SectionTabs } from "./section-tabs";

export function PurchasesTabs() {
  return (
    <SectionTabs
      label="Purchases sections"
      tabs={[
        { href: "/purchases/orders", label: "Purchase orders" },
        { href: "/purchases/owe", label: "Who you owe", exact: true, also: ["/purchases/bills", "/purchases/payments"] },
        { href: "/purchases/fabrics", label: "Fabrics" },
        { href: "/purchases/suppliers", label: "Suppliers" },
      ]}
    />
  );
}

export function OrdersTabs() {
  return (
    <SectionTabs
      label="Orders sections"
      tabs={[
        { href: "/orders", label: "Orders", exact: true },
        { href: "/orders/quotes", label: "Quotes" },
        { href: "/orders/products", label: "Products" },
      ]}
    />
  );
}

export function WorkshopTabs({ owner }: { owner: boolean }) {
  return (
    <SectionTabs
      label="Workshop sections"
      tabs={[
        { href: "/workshop", label: owner ? "Tasks" : "My tasks", exact: true },
        { href: "/workshop/gallery", label: "Gallery" },
      ]}
    />
  );
}

export function MoneyTabs() {
  return (
    <SectionTabs
      label="Money sections"
      tabs={[
        { href: "/money", label: "Who owes you", exact: true, also: ["/money/statement"] },
        { href: "/money/invoices", label: "Invoices" },
        { href: "/money/payments", label: "Payments" },
      ]}
    />
  );
}
