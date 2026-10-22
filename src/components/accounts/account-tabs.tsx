import Link from "next/link";
import { cn } from "cn";

export const ACCOUNT_TABS = ["overview", "branches", "staff", "catalogue", "orders", "deliveries", "report"] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];
const LABEL: Record<AccountTab, string> = {
  overview: "Overview",
  branches: "Branches",
  staff: "Staff",
  catalogue: "Catalogue",
  orders: "Orders",
  deliveries: "Deliveries",
  report: "Report",
};

/** The key account's own sections, kept on the customer page so the sidebar never grows. */
export function AccountTabs({ customerId, active, counts }: { customerId: string; active: AccountTab; counts: Partial<Record<AccountTab, number>> }) {
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Account sections">
      <ul className="flex w-max gap-1.5 rounded-full border border-line bg-surface p-1">
        {ACCOUNT_TABS.map((t) => (
          <li key={t}>
            <Link
              href={t === "overview" ? `/customers/${customerId}` : `/customers/${customerId}?tab=${t}`}
              scroll={false}
              aria-current={active === t ? "page" : undefined}
              className={cn("flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors", active === t ? "bg-ink text-paper" : "text-ink hover:bg-paper-deep")}
            >
              {LABEL[t]}
              {counts[t] ? <span className={cn("tabular text-[12px]", active === t ? "text-paper/70" : "text-ink-muted")}>{counts[t]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
