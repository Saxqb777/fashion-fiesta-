import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "cn";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-ink-muted hover:text-ink">
      <ArrowLeftIcon className="size-4" />
      {label}
    </Link>
  );
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[14px] border border-line bg-surface p-5 sm:p-6", className)}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-lg font-medium">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label and value pairs. Empty values are hidden, never shown as a dash. */
export function Facts({ items }: { items: { label: string; value?: React.ReactNode; hint?: string }[] }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  if (!shown.length) return null;
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {shown.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[13px] font-semibold text-ink-muted">{i.label}</dt>
          <dd className="mt-0.5 text-[15px] break-words text-ink">{i.value}</dd>
          {i.hint ? <p className="mt-0.5 text-[12px] text-ink-muted">{i.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
