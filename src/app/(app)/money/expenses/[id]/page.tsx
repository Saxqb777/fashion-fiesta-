import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { activeExpenseCategories } from "@/lib/expenses";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const expense = /^[0-9a-f-]{36}$/.test(id) ? await db.query.expenses.findFirst({ where: eq(expenses.id, id) }) : undefined;
  if (!expense) notFound();
  const [categories, s, category] = await Promise.all([
    activeExpenseCategories(),
    getSettings(),
    db.query.expenseCategories.findFirst({ where: eq(expenseCategories.id, expense.categoryId) }),
  ]);
  // An archived category still shows on the expenses that used it.
  const options = categories.some((c) => c.id === expense.categoryId) || !category ? categories : [...categories, { id: category.id, name: category.name }];
  return (
    <>
      <BackLink href="/money/expenses" label="Expenses" />
      <PageHeader title={expense.description} description={`${formatFils(expense.amountFils)}${expense.sourceType ? ". Made by a salary payment, so it changes there." : ". Change anything and save. The cash book follows."}`} />
      {expense.sourceType ? null : <ExpenseForm categories={options} expense={expense} today={todayISO()} vatRateBp={s.vatRateBp} />}
    </>
  );
}
