import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { PoEditor } from "@/components/purchases/po-editor";
import { initialForPO, poEditorData } from "@/lib/po-data";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const [initial, data, s] = await Promise.all([initialForPO(id), poEditorData(), getSettings()]);
  if (!initial) notFound();
  return (
    <>
      <BackLink href={`/purchases/orders/${id}`} label="Purchase order" />
      <PageHeader title={initial.isDraft ? "Draft purchase order" : "Edit purchase order"} />
      <PoEditor initial={initial} {...data} vatRateBp={s.vatRateBp} cancelHref={`/purchases/orders/${id}`} />
    </>
  );
}
