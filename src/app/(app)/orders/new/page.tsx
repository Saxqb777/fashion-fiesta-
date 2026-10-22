import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { DocumentEditor } from "@/components/orders/document-editor";
import { PageHeader } from "@/components/page-header";
import { editorLookups } from "@/lib/editor-data";
import { initialForNewOrder } from "@/lib/editor-initial";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ copy?: string; fromQuote?: string; customer?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const [initial, lookups] = await Promise.all([initialForNewOrder(params), editorLookups()]);
  const title = initial.sourceQuoteId ? "Confirm the quote as an order" : params.copy && initial.lines.length ? "Order again" : "New order";
  return (
    <>
      <BackLink href="/orders" label="Orders" />
      <PageHeader
        title={title}
        description={
          initial.sourceQuoteId
            ? "Add due dates and assign the work. Lines and prices come from the quote."
            : params.copy && initial.lines.length
              ? "Same lines and prices as last time. Change the quantities, set due dates and assign."
              : undefined
        }
      />
      <DocumentEditor mode="order" initial={initial} cancelHref="/orders" {...lookups} />
    </>
  );
}
