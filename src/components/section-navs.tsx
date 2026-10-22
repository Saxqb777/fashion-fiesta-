import { SectionTabs } from "./section-tabs";

export function PurchasesTabs() {
  return (
    <SectionTabs
      label="Purchases sections"
      tabs={[
        { href: "/purchases/suppliers", label: "Suppliers" },
        { href: "/purchases/fabrics", label: "Fabrics" },
        { href: "/purchases/orders", label: "Purchase orders", soon: 4 },
      ]}
    />
  );
}

export function OrdersTabs() {
  return (
    <SectionTabs
      label="Orders sections"
      tabs={[
        { href: "/orders/list", label: "Orders", soon: 2 },
        { href: "/orders/products", label: "Products" },
      ]}
    />
  );
}
