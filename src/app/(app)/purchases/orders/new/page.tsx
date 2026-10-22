import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { PoEditor } from "@/components/purchases/po-editor";
import { initialForNewPO, poEditorData } from "@/lib/po-data";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  await requireOwner();
  const { supplier } = await searchParams;
  const [initial, data, s] = await Promise.all([initialForNewPO(supplier), poEditorData(), getSettings()]);
  return (
    <>
      <BackLink href="/purchases/orders" label="Purchase orders" />
      <PageHeader title="New purchase order" description="Fabric from a supplier, or stitching from a unit. Stitching for an order is made for you when you assign lines to a unit." />
      <PoEditor initial={initial} {...data} vatRateBp={s.vatRateBp} cancelHref="/purchases/orders" />
    </>
  );
}
