import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { cn } from "cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 md:mb-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-[2rem] leading-[1.05] font-medium text-ink md:text-[2.5rem]">{title}</h1>
          {description ? <p className="mt-2 max-w-prose text-[15px] text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <SwooshStripe className="mt-4 max-w-[72px]" />
    </header>
  );
}
