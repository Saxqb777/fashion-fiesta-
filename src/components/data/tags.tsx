import { cn } from "cn";
import type { CustomerTier } from "@/db/schema";
import { TIER_LABEL } from "@/lib/labels";

const pill = "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-bold tracking-wide uppercase";

export function TierTag({ tier, className }: { tier: CustomerTier; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        tier === "vip" && "border-magenta/25 bg-magenta/10 text-magenta",
        tier === "regular" && "border-line bg-paper-deep text-ink",
        tier === "new" && "border-leaf/40 bg-leaf/15 text-[#4d7a12]",
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

export function SoftTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn(pill, "border-line bg-surface text-ink-muted", className)}>{children}</span>;
}

export function ArchivedTag() {
  return <SoftTag className="border-brand/20 bg-brand-soft text-brand-deep">Archived</SoftTag>;
}
