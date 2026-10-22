import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/data/detail";
import { DocumentEditor } from "@/components/orders/document-editor";
import { PageHeader } from "@/components/page-header";
import { editorLookups } from "@/lib/editor-data";
import { initialForQuote } from "@/lib/editor-initial";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Edit quote" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [initial, lookups] = await Promise.all([initialForQuote(id), editorLookups()]);
  if (!initial) notFound();
  return (
    <>
      <BackLink href={`/orders/quotes/${id}`} label={initial.number ?? "Quote"} />
      <PageHeader title={`Edit ${initial.number}`} />
      <DocumentEditor mode="quote" initial={initial} cancelHref={`/orders/quotes/${id}`} {...lookups} />
    </>
  );
}
