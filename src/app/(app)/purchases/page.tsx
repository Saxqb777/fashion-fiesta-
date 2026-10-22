import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Purchases" };

export default function Page() {
  return <ComingSoon section="purchases" />;
}
