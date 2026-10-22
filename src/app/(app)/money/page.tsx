import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Money" };

export default function Page() {
  return <ComingSoon section="money" />;
}
