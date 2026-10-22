import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { customerDesigns } from "@/actions/embroidery";
import { getCustomerContext } from "@/actions/documents";
import { db } from "@/db";
import { embroideryJobs } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { JobForm } from "@/components/embroidery/job-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Edit embroidery job" };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const job = /^[0-9a-f-]{36}$/.test(id) ? await db.query.embroideryJobs.findFirst({ where: eq(embroideryJobs.id, id) }) : undefined;
  if (!job) notFound();
  const [s, ctx, designs] = await Promise.all([getSettings(), job.customerId ? getCustomerContext(job.customerId) : null, job.customerId ? customerDesigns(job.customerId) : undefined]);
  return (
    <>
      <BackLink href={`/workshop/embroidery/${job.id}`} label="Job" />
      <PageHeader title="Edit embroidery job" />
      <JobForm job={job} customer={ctx?.customer ?? null} startDesigns={designs} operatorName={s.embroideryOperatorName ?? ""} shopSharePercent={s.embroideryShopSharePercent} today={todayISO()} />
    </>
  );
}
