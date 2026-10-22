import Link from "next/link";
import { cn } from "cn";

type Params = Record<string, string | undefined>;

export function hrefWith(base: string, params: Params, change: Params) {
  const merged = { ...params, ...change };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** One row of mutually exclusive filters, as links so they work without JS. */
export function FilterChips({
  base,
  params,
  name,
  options,
}: {
  base: string;
  params: Params;
  name: string;
  options: { value?: string; label: string; count?: number }[];
}) {
  const current = params[name];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = (o.value ?? undefined) === (current ?? undefined);
        return (
          <Link
            key={o.label}
            href={hrefWith(base, params, { [name]: o.value })}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              active ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:bg-paper-deep",
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn("tabular text-xs", active ? "text-paper/70" : "text-ink-muted")}>{o.count}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
