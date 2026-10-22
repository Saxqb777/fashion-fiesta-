"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";

/** Updates ?q= as you type. Keeps every other filter. */
export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function push(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next.trim()) sp.set("q", next.trim());
    else sp.delete("q");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(timer.current);
          const next = e.target.value;
          timer.current = setTimeout(() => push(next), 250);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-[10px] border border-line bg-surface pr-10 pl-10 text-base text-ink outline-none placeholder:text-ink-muted/70 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {pending ? (
        <Loader2Icon className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-ink-muted" />
      ) : value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            push("");
          }}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-paper-deep"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
