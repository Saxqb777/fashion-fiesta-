"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export type SectionTab = {
  href: string;
  label: string;
  exact?: boolean;
  also?: string[];
};

/** Pill tabs, one per part of a section. */
export function SectionTabs({
  tabs,
  label,
}: {
  tabs: SectionTab[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0"
      aria-label={label}
    >
      <ul className="flex w-max gap-1.5 rounded-full border border-line bg-surface p-1">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.href ||
              (t.also ?? []).some((a) => pathname.startsWith(a))
            : pathname.startsWith(t.href);
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
