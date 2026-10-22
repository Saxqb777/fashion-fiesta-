import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { BackLink, Panel } from "@/components/data/detail";
import { PageHeader } from "@/components/page-header";
import { AdvanceButton, SetSalaryButton } from "@/components/team/salary-actions";
import { POT_LABEL } from "@/lib/cash";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { advanceBalances, monthLabel, personPayHistory } from "@/lib/salaries";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Pay history" };

export default async function PersonPayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const p = /^[0-9a-f-]{36}$/.test(id) ? await db.query.users.findFirst({ where: eq(users.id, id) }) : undefined;
  if (!p) notFound();
  const [{ payments, advances }, balances] = await Promise.all([personPayHistory(p.id), advanceBalances()]);
  const balance = balances.get(p.id) ?? 0;
  const person = { id: p.id, name: p.name, salaryFils: p.salaryFils, payDay: p.payDay };
  return (
    <>
      <BackLink href="/settings/team" label="Team" />
      <PageHeader
        title={p.name}
        description={p.salaryFils ? `${formatFils(p.salaryFils)} a month, paid on day ${p.payDay ?? 1}.` : "No salary in the app."}
        actions={
          <>
            {p.salaryFils ? <AdvanceButton person={person} today={todayISO()} /> : null}
            <SetSalaryButton person={person} />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Pay history">
          {payments.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {payments.map((x) => (
                <li key={x.id} className="tabular flex flex-wrap items-baseline gap-x-3 py-2.5 text-[14px]">
                  <span className="w-36 font-semibold">{monthLabel(x.month)}</span>
                  <span className="text-ink-muted">
                    Paid {formatISODate(x.payDate)} from {POT_LABEL[x.pot].toLowerCase()}
                    {x.advancesDeductedFils ? `, ${formatFils(x.advancesDeductedFils)} advance taken off` : ""}
                  </span>
                  <span className="ml-auto font-display text-lg">{formatFils(x.netFils)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-ink-muted">Nothing paid through the app yet. Pay from Settings, Team, on pay day.</p>
          )}
        </Panel>
        <Panel title="Advances">
          <p className="tabular font-display text-[2rem] leading-tight">{formatFils(balance)}</p>
          <p className="text-[13px] text-ink-muted">{balance ? "Still to take off a salary." : "Nothing outstanding."}</p>
          {advances.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
              {advances.map((a) => (
                <li key={a.id} className="tabular flex items-baseline gap-3 py-2 text-[14px]">
                  <span className="text-ink-muted">{formatISODate(a.advanceDate, true)}</span>
                  <span className="flex-1 truncate">{a.notes}</span>
                  <span className="font-semibold">{formatFils(a.amountFils)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
