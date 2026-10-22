import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const owner = user.role === "owner";

  return (
    <>
      <PageHeader eyebrow={formatLongDate(new Date())} title="Today" />

      {owner ? (
        <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
          <p className="text-sm font-semibold text-ink-muted">
            Cash in hand <span className="ml-1 font-medium text-ink-muted/70">cash book</span>
          </p>
          <p className="tabular mt-2 font-display text-[3rem] leading-none font-medium sm:text-[4rem]">{formatFils(0)}</p>
          <p className="mt-3 text-[13px] text-ink-muted">Starts counting in Phase 5, when the cash book arrives.</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-medium">Needs your attention</h2>
        <EmptyState
          sentence={
            owner
              ? `Nothing needs you yet. Phase 1 brings customers, suppliers, products and fabrics to ${settings.tradeName}.`
              : "Nothing is assigned to you yet. Your tasks will appear here when the workshop opens in Phase 2."
          }
          action={
            owner ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>
                Open Settings
              </Button>
            ) : undefined
          }
        />
      </section>
    </>
  );
}
