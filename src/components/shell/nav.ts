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
  roles: UserRole[];
};

export const NAV_GROUPS: NavItem[][] = [
  [{ href: "/today", label: "Today", icon: Sun, roles: ["owner", "tailor"] }],
  [
    { href: "/orders", label: "Orders", icon: Scissors, roles: ["owner"] },
    { href: "/customers", label: "Customers", icon: Users, roles: ["owner"] },
    { href: "/money", label: "Money", icon: Wallet, roles: ["owner"] },
  ],
  [
    { href: "/workshop", label: "Workshop", icon: Shirt, roles: ["owner", "tailor"] },
    { href: "/purchases", label: "Purchases", icon: Package, roles: ["owner"] },
  ],
  [
    { href: "/reports", label: "Reports", icon: ChartColumn, roles: ["owner"] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
  ],
];

export function navForRole(role: UserRole) {
  return NAV_GROUPS.map((g) => g.filter((i) => i.roles.includes(role))).filter((g) => g.length > 0);
}
