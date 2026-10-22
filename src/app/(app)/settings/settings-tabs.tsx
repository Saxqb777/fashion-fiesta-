"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/settings/shop", label: "Shop" },
  { href: "/settings/money", label: "Money" },
  { href: "/settings/numbering", label: "Numbering" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/categories", label: "Categories" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Settings sections">
      <ul className="flex w-max gap-1.5 rounded-full border border-line bg-surface p-1">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors",
                  active ? "bg-ink text-paper" : "text-ink hover:bg-paper-deep",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
