import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { DocumentEditor } from "@/components/orders/document-editor";
import { PageHeader } from "@/components/page-header";
import { editorLookups } from "@/lib/editor-data";
import { initialForQuote } from "@/lib/editor-initial";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireOwner();
  const { customer } = await searchParams;
  const [initial, lookups] = await Promise.all([initialForQuote(undefined, customer), editorLookups()]);
  return (
    <>
      <BackLink href="/orders/quotes" label="Quotes" />
      <PageHeader title="New quote" />
      <DocumentEditor mode="quote" initial={initial!} cancelHref="/orders/quotes" {...lookups} />
    </>
  );
}
