import { redirect } from "next/navigation";

/** The VAT summary moved into Reports, Tax. Old links still land on the same quarter. */
export default async function VatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? `/reports/tax?q=${q}` : "/reports/tax");
}
