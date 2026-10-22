import { SETUP_STEPS } from "@/lib/defaults";

export function StepFrame({
  step,
  title,
  description,
  children,
}: {
  step: (typeof SETUP_STEPS)[number];
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const n = SETUP_STEPS.indexOf(step) + 1;
  return (
    <div>
      <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">
        Step {n} of {SETUP_STEPS.length}
      </p>
      <h1 className="mt-2 text-[1.75rem] leading-[1.1] font-medium sm:text-[2.125rem]">{title}</h1>
      {description ? <p className="mt-2 max-w-prose text-[15px] text-ink-muted">{description}</p> : null}
      <div className="mt-6 sm:mt-8">{children}</div>
    </div>
  );
}
