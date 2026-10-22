"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shows a toast for ?added=1 or ?saved=1 after a redirect, then cleans the URL. */
export function Flash({ added, saved }: { added?: string; saved?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const isAdded = params.get("added");
    const isSaved = params.get("saved");
    if (!isAdded && !isSaved) return;
    if (isAdded && added) toast.success(added);
    if (isSaved && saved) toast.success(saved);
    const sp = new URLSearchParams(params.toString());
    sp.delete("added");
    sp.delete("saved");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, router, pathname, added, saved]);
  return null;
}
