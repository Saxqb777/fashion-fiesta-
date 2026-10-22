import type { Metadata } from "next";
import { BackLink } from "@/components/data/detail";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { activeExpenseCategories } from "@/lib/expenses";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage() {
  await requireOwner();
  const [categories, s] = await Promise.all([activeExpenseCategories(), getSettings()]);
  return (
    <>
      <BackLink href="/money/expenses" label="Expenses" />
      <PageHeader title="New expense" description="Money that went out for the shop: rent, bills, supplies, transport." />
      <ExpenseForm categories={categories} today={todayISO()} vatRateBp={s.vatRateBp} />
    </>
  );
}
