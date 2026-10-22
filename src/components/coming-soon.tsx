import { PageHeader } from "@/components/page-header";
import { SECTION_COPY } from "@/components/shell/nav";

export function ComingSoon({ section }: { section: keyof typeof SECTION_COPY }) {
  const copy = SECTION_COPY[section];
  return (
    <>
      <PageHeader title={copy.title} />
      <div className="rounded-[14px] border border-dashed border-line bg-surface/60 px-5 py-6 md:px-6 md:py-8">
        <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Phase {copy.phase}</p>
        <p className="mt-2 max-w-prose text-[15px] text-ink-muted">{copy.sentence}</p>
      </div>
    </>
  );
}
