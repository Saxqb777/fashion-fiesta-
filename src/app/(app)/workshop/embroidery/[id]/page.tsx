import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DownloadIcon, PencilIcon } from "lucide-react";
import { db } from "@/db";
import { customers, embroideryJobs, salesOrders } from "@/db/schema";
import { BackLink, Facts, Panel } from "@/components/data/detail";
import { SoftTag } from "@/components/data/tags";
import { DoneButton } from "@/components/embroidery/embroidery-actions";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { formatISODate } from "@/lib/dates";
import { splitOf } from "@/lib/embroidery";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Embroidery job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const job = /^[0-9a-f-]{36}$/.test(id) ? await db.query.embroideryJobs.findFirst({ where: eq(embroideryJobs.id, id) }) : undefined;
  if (!job) notFound();
  const [s, customer, order] = await Promise.all([
    getSettings(),
    job.customerId ? db.query.customers.findFirst({ where: eq(customers.id, job.customerId) }) : undefined,
    job.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, job.orderId) }) : undefined,
  ]);
  const who = s.embroideryOperatorName || "The operator";
  const split = splitOf(job);
  const done = job.status === "done";

  return (
    <>
      <BackLink href="/workshop/embroidery" label="Embroidery" />
      <PageHeader
        eyebrow={`${job.side === "shop" ? "Shop's customer" : `${who}'s customer`} · ${formatISODate(job.jobDate, true)}`}
        title={customer ? <Link href={`/customers/${customer.id}`} className="hover:underline">{customer.name}</Link> : (job.customerName ?? "Customer")}
        description={`${job.description}, ${job.pieces} ${job.pieces === 1 ? "piece" : "pieces"}.`}
        actions={
          <LinkButton href={`/workshop/embroidery/${job.id}/edit`} variant="outline" size="sm">
            <PencilIcon />
            Edit
          </LinkButton>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Design">
            {job.designFileUrl ? (
              <LinkButton href={job.designFileUrl} size="lg" className="self-start">
                <DownloadIcon />
                Download {job.designFileName ?? "the design file"}
              </LinkButton>
            ) : (
              <p className="text-[15px] text-ink-muted">No machine file yet. Add it from Edit, and the operator downloads it here.</p>
            )}
            <div className="mt-4">
              <Facts
                items={[
                  { label: "Thread colours", value: job.threadColours },
                  { label: "Size", value: job.designSize },
                  { label: "Placement", value: job.placement },
                  { label: "Notes", value: job.notes ? <span className="whitespace-pre-line">{job.notes}</span> : null },
                ]}
              />
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={done ? "Done" : "To do"}>
            {done ? <SoftTag className="mb-3 border-leaf/50 bg-leaf/15 text-[#4d7a12]">Counted in the balance</SoftTag> : <p className="mb-3 text-[14px] text-ink-muted">When the pieces come off the machine, mark it done.</p>}
            <DoneButton id={job.id} done={done} />
          </Panel>
          <Panel title="The split">
            <dl className="tabular flex flex-col gap-1.5 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Job price, before VAT</dt>
                <dd>{formatFils(job.priceFils)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Shop, {job.shopSharePercent}%</dt>
                <dd>{formatFils(split.shop)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{who}</dt>
                <dd>{formatFils(split.operator)}</dd>
              </div>
            </dl>
            {order ? (
              <p className="mt-3 border-t border-line pt-3 text-[14px]">
                For order{" "}
                <Link href={`/orders/${order.id}`} className="font-semibold underline-offset-2 hover:underline">
                  {order.number}
                </Link>
                . Bill the embroidery on that order.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  );
}
