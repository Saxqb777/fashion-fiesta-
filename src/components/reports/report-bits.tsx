import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ReportsTabs } from "@/components/section-navs";
import { cn } from "cn";
import { ExcelLink } from "./report-table";

export function ReportsHeader({ excel, query }: { excel?: string; query?: string }) {
  return (
    <>
      <PageHeader title="Reports" actions={excel ? <ExcelLink name={excel} query={query} /> : undefined} />
      <ReportsTabs />
    </>
  );
}

/** A row of choices that are links, so the pick lives in the address and the Excel download. */
export function PickRow({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              scroll={false}
              aria-current={i.active ? "true" : undefined}
              className={cn("flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap", i.active ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper-deep")}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
