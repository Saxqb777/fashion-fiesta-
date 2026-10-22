"use client";

import { useActionState, useState } from "react";
import { saveExpense } from "@/actions/expenses";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PhotoUpload } from "@/components/data/photo-upload";
import { LinkButton } from "@/components/link-button";
import { Label } from "@/components/ui/label";
import type { Expense } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { cn } from "cn";

export function ExpenseForm({ categories, expense, today, vatRateBp }: { categories: { id: string; name: string }[]; expense?: Expense; today: string; vatRateBp: number }) {
  const [state, action] = useActionState(saveExpense, EMPTY_FORM_STATE);
  const e = state.errors ?? {};
  const [pot, setPot] = useState<"cash" | "bank">(expense?.pot ?? "cash");
  const [amount, setAmount] = useState(expense ? (expense.amountFils / 100).toFixed(2) : "");
  const [vat, setVat] = useState(Boolean(expense?.vatFils));
  const fils = Math.round((Number(amount) || 0) * 100);
  const vatFils = vat ? Math.round((fils * vatRateBp) / (10000 + vatRateBp)) : 0;
  return (
    <ActionForm action={action} className="flex max-w-2xl flex-col gap-5">
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      <input type="hidden" name="pot" value={pot} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <section className="flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount paid, AED</Label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            autoFocus={!expense}
            aria-invalid={e.amount ? true : undefined}
            className="tabular h-16 w-full max-w-xs rounded-[10px] border border-line bg-surface px-4 font-display text-3xl outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
          />
          {e.amount ? <p className="text-[13px] font-medium text-brand-deep">{e.amount[0]}</p> : <p className="text-[12px] text-ink-muted">The total on the receipt, VAT included.</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Paid from</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Paid from">
            {(["cash", "bank"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={pot === p}
                onClick={() => setPot(p)}
                className={cn("h-11 rounded-full border px-5 text-[14px] font-semibold", pot === p ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
              >
                {p === "cash" ? "Cash drawer" : "Bank or card"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="categoryId" label="Category" defaultValue={expense?.categoryId ?? ""} errors={e.categoryId}>
            <option value="" disabled>
              Pick one
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <TextField name="date" label="Date" type="date" defaultValue={expense?.expenseDate ?? today} />
        </div>
        <TextField name="description" label="What for" defaultValue={expense?.description ?? ""} errors={e.description} placeholder="October rent, thread and needles, taxi to Ajman" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="payee" label="Paid to" defaultValue={expense?.payee ?? ""} placeholder="Optional" />
          <TextField name="payeeTrn" label="Their TRN" defaultValue={expense?.payeeTrn ?? ""} inputMode="numeric" errors={e.payeeTrn} className="tabular" placeholder="Only for VAT" />
        </div>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="vat" checked={vat} onChange={(ev) => setVat(ev.target.checked)} className="size-5 accent-[#D7182A]" />
          The receipt shows VAT {vatRateBp / 100}%
          {vat && fils ? <span className="tabular text-ink-muted">: {formatFils(vatFils)} to claim back</span> : null}
        </label>
        <PhotoUpload name="receiptUrl" folder="receipts" defaultUrl={expense?.receiptUrl} label="Receipt photo, optional" emptyText="Take a photo of the receipt" />
        <TextField name="notes" label="Note" defaultValue={expense?.notes ?? ""} placeholder="Optional" />
      </section>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingText="Saving">
          {expense ? "Save changes" : fils ? `Record ${formatFils(fils)}` : "Record expense"}
        </SubmitButton>
        <LinkButton href="/money/expenses" variant="ghost" size="lg">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
