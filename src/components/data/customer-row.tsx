import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { Customer } from "@/db/schema";
import { CUSTOMER_TYPE_LABEL } from "@/lib/labels";
import { ArchivedTag, TierTag } from "./tags";

export function CustomerRow({ c, branchCount }: { c: Customer; branchCount: number }) {
  const meta = [
    CUSTOMER_TYPE_LABEL[c.type],
    branchCount ? `${branchCount} ${branchCount === 1 ? "branch" : "branches"}` : null,
    c.phone,
  ].filter(Boolean);
  return (
    <li>
      <Link
        href={`/customers/${c.id}`}
        className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-ink/20 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[16px] font-semibold text-ink">{c.name}</p>
            {c.tier === "vip" ? <TierTag tier="vip" /> : null}
            {c.deletedAt ? <ArchivedTag /> : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-muted">{meta.join(" · ")}</p>
        </div>
        {c.tier !== "vip" ? <TierTag tier={c.tier} className="hidden sm:inline-flex" /> : null}
        <ChevronRightIcon className="size-5 shrink-0 text-ink-muted/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
