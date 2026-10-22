import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { creditNoteLines, creditNotes, customers, invoiceLines, invoices } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { CreditForm } from "@/components/money/credit-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Credit note" };

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const invoice = /^[0-9a-f-]{36}$/.test(id) ? await db.query.invoices.findFirst({ where: eq(invoices.id, id) }) : undefined;
  if (!invoice) notFound();
  if (invoice.kind !== "tax_invoice") redirect(`/money/invoices/${id}`);
  const [customer, lines, credited] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId) }),
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sort)),
    db
      .select({ id: creditNoteLines.invoiceLineId, n: sql<number>`sum(${creditNoteLines.qty})::int` })
      .from(creditNoteLines)
      .innerJoin(creditNotes, eq(creditNotes.id, creditNoteLines.creditNoteId))
      .where(eq(creditNotes.invoiceId, id))
      .groupBy(creditNoteLines.invoiceLineId),
  ]);
  const rows = lines.map((l) => ({ id: l.id, description: l.description, left: l.qty - (credited.find((c) => c.id === l.id)?.n ?? 0), unitPriceFils: l.unitPriceFils, vatRateBp: l.vatRateBp }));
  return (
    <>
      <BackLink href={`/money/invoices/${id}`} label={invoice.number ?? "Invoice"} />
      <PageHeader
        eyebrow={`Against Tax Invoice ${invoice.number}`}
        title={`Credit note for ${customer?.name ?? "customer"}`}
        description="Enter how many pieces to credit on each line. The credit lowers what they owe on this invoice."
      />
      <CreditForm invoiceId={id} lines={rows} today={todayISO()} />
    </>
  );
}
