import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Orders" };

export default function Page() {
  return <ComingSoon section="orders" />;
}
