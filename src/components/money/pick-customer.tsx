"use client";

import { useRouter } from "next/navigation";
import { CustomerPicker } from "@/components/orders/customer-picker";

/** Pick who paid, then the page reloads with their open invoices. */
export function PickCustomer() {
  const router = useRouter();
  return <CustomerPicker value={null} onPick={(id) => id && router.push(`/money/payments/new?customer=${id}`)} />;
}
