"use client";

import { useRouter } from "next/navigation";
import { hrefWith } from "@/components/data/filter-chips";

export function BranchFilter({ base, params, branches, value }: { base: string; params: Record<string, string | undefined>; branches: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Branch"
      value={value}
      onChange={(e) => router.push(hrefWith(base, params, { branch: e.target.value || undefined }), { scroll: false })}
      className="h-9 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold"
    >
      <option value="">All branches</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
