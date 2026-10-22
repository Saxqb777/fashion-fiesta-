import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { JobForm } from "@/components/embroidery/job-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New embroidery job" };

export default async function NewJobPage() {
  await requireOwner();
  const s = await getSettings();
  return (
    <>
      <BackLink href="/workshop/embroidery" label="Embroidery" />
      <PageHeader title="New embroidery job" />
      <JobForm operatorName={s.embroideryOperatorName ?? ""} shopSharePercent={s.embroideryShopSharePercent} today={todayISO()} />
    </>
  );
}
