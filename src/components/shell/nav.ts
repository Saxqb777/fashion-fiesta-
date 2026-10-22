import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  Package,
  Scissors,
  Settings,
  Shirt,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/db/schema";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase in which this section becomes real. 0 means built. */
  phase: number;
  roles: UserRole[];
};

export const NAV_GROUPS: NavItem[][] = [
  [{ href: "/today", label: "Today", icon: Sun, phase: 0, roles: ["owner", "tailor"] }],
  [
    { href: "/orders", label: "Orders", icon: Scissors, phase: 2, roles: ["owner"] },
    { href: "/customers", label: "Customers", icon: Users, phase: 1, roles: ["owner"] },
    { href: "/money", label: "Money", icon: Wallet, phase: 3, roles: ["owner"] },
  ],
  [
    { href: "/workshop", label: "Workshop", icon: Shirt, phase: 2, roles: ["owner", "tailor"] },
    { href: "/purchases", label: "Purchases", icon: Package, phase: 4, roles: ["owner"] },
  ],
  [
    { href: "/reports", label: "Reports", icon: ChartColumn, phase: 6, roles: ["owner"] },
    { href: "/settings", label: "Settings", icon: Settings, phase: 0, roles: ["owner"] },
  ],
];

export function navForRole(role: UserRole) {
  return NAV_GROUPS.map((g) => g.filter((i) => i.roles.includes(role))).filter((g) => g.length > 0);
}

export const SECTION_COPY: Record<string, { title: string; sentence: string; phase: number }> = {
  orders: { title: "Orders", sentence: "Quotes, sales orders and the stage tracker arrive in Phase 2.", phase: 2 },
  customers: {
    title: "Customers",
    sentence: "Customers with branches, tiers and credit terms arrive in Phase 1.",
    phase: 1,
  },
  money: { title: "Money", sentence: "Invoices, payments, receipts and who owes you arrive in Phase 3.", phase: 3 },
  workshop: { title: "Workshop", sentence: "Tailor tasks, photo cards and the Gallery arrive in Phase 2.", phase: 2 },
  purchases: {
    title: "Purchases",
    sentence: "Purchase orders, fabric stock and supplier bills arrive in Phase 4.",
    phase: 4,
  },
  reports: { title: "Reports", sentence: "Who owes you, sales by customer and the VAT summary arrive in Phase 6.", phase: 6 },
};
