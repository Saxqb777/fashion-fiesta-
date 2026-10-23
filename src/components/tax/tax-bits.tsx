"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

/** The three parts of the Tax tab. Lighter than the section pills, so the two rows read as levels. */
export function TaxTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/reports/tax", label: "VAT return", exact: true },
    { href: "/reports/tax/corporate", label: "Corporate tax" },
    { href: "/reports/tax/e-invoicing", label: "E-invoicing" },
  ];
  return (
    <nav aria-label="Tax sections" className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-6 border-b border-line">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("-mb-px flex h-10 items-center border-b-2 text-[15px] font-semibold", active ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}
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

/** Copies a figure exactly as EmaraTax wants it typed: no commas, two decimals. */
export function CopyValue({ fils, label }: { fils: number; label: string }) {
  const [done, setDone] = useState(false);
  const value = (fils / 100).toFixed(2);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          toast.success(`Copied ${value}`);
          setTimeout(() => setDone(false), 1500);
        })
      }
      aria-label={`Copy ${label}: ${value}`}
      className={cn("h-8 shrink-0 rounded-full border px-3 text-[12px] font-bold transition-colors", done ? "border-leaf bg-leaf/15 text-ink" : "border-line bg-surface text-ink hover:bg-paper-deep")}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
