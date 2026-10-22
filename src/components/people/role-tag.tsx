import { cn } from "cn";
import type { UserRole } from "@/db/schema";

export function RoleTag({ role, muted }: { role: UserRole; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-bold tracking-wide uppercase",
        muted
          ? "border-line text-ink-muted"
          : role === "owner"
            ? "border-brand/30 bg-brand-soft text-brand-deep"
            : "border-line bg-paper-deep text-ink",
      )}
    >
      {role}
    </span>
  );
}
