import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashBook, dailyCloses } from "@/db/schema";
import { CloseDayForm, MoveMoneyButton } from "@/components/cash/cash-forms";
import { SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { CountUp } from "@/components/money/count-up";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { cardTotalOn, CASH_KIND_LABEL, expectedCashOn, potBalances, POT_LABEL } from "@/lib/cash";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { cn } from "cn";

export const metadata: Metadata = { title: "Cash book" };

/** Each row with the pot's balance after it, oldest first. */
function runningBalance<T extends { amountFils: number }>(rows: T[]) {
  const out: (T & { balance: number })[] = [];
  let balance = 0;
  for (const r of rows) {
    balance += r.amountFils;
    out.push({ ...r, balance });
  }
  return out;
}

export default async function CashBookPage({ searchParams }: { searchParams: Promise<{ pot?: string }> }) {
  await requireOwner();
  const { pot: potParam } = await searchParams;
  const pot = potParam === "bank" ? "bank" : "cash";
  const today = todayISO();
  const [balances, rows, closes, expected, card] = await Promise.all([
    potBalances(),
    db.select().from(cashBook).where(eq(cashBook.pot, pot)).orderBy(asc(cashBook.entryDate), asc(cashBook.createdAt)),
    db.select().from(dailyCloses).orderBy(desc(dailyCloses.closeDate)).limit(14),
    expectedCashOn(today),
    cardTotalOn(today),
  ]);
  const ledger = runningBalance(rows).reverse().slice(0, 200);
  const todayClose = closes.find((c) => c.closeDate === today);

  return (
    <>
      <PageHeader title="Money" actions={<MoveMoneyButton today={today} />} />
      <MoneyTabs />

      <section className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
          <p className="text-sm font-semibold text-ink-muted">
            Cash in hand <span className="ml-1 font-medium text-ink-muted/70">cash drawer</span>
          </p>
          <p className="tabular mt-2 font-display text-[3rem] leading-none font-medium sm:text-[3.75rem]">
            <CountUp fils={balances.cash} />
          </p>
          <p className="tabular mt-4 text-[15px]">
            <span className="text-ink-muted">In the bank </span>
            <span className="font-display text-xl">{formatFils(balances.bank)}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">Card, transfer and cheque payments land in the bank. Cash goes in the drawer.</p>
        </div>
        <div className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-medium">{todayClose ? "Today is closed" : "Close the day"}</h2>
          {todayClose ? (
            <p className={cn("tabular mt-1 text-[15px] font-semibold", todayClose.differenceFils ? "text-brand" : "text-[#4d7a12]")}>
              Counted {formatFils(todayClose.countedCashFils)}.{" "}
              {todayClose.differenceFils ? `${todayClose.differenceFils > 0 ? "Over" : "Short"} by ${formatFils(Math.abs(todayClose.differenceFils))}.` : "It matched."}
            </p>
          ) : (
            <p className="mt-1 text-[14px] text-ink-muted">Thirty seconds at closing: count the drawer and type the total.</p>
          )}
          <div className="mt-4">
            <CloseDayForm expectedFils={expected} cardFils={card} counted={todayClose?.countedCashFils ?? null} />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-medium">Every movement</h2>
          <div className="flex gap-1.5">
            {(["cash", "bank"] as const).map((p) => (
              <Link
                key={p}
                href={p === "cash" ? "/money/cash" : "/money/cash?pot=bank"}
                scroll={false}
                className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", pot === p ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
              >
                {POT_LABEL[p]}
              </Link>
            ))}
          </div>
        </div>
        {ledger.length ? (
          <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
            <table className="tabular w-full min-w-[620px] text-left text-[14px]">
              <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">What</th>
                  <th className="px-4 py-2.5 text-right">In</th>
                  <th className="px-4 py-2.5 text-right">Out</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{formatISODate(r.entryDate)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">{r.description}</span>
                      <SoftTag className="ml-2 align-middle">{CASH_KIND_LABEL[r.kind]}</SoftTag>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#4d7a12]">{r.amountFils > 0 ? formatFils(r.amountFils, { currency: false }) : ""}</td>
                    <td className="px-4 py-2.5 text-right">{r.amountFils < 0 ? formatFils(-r.amountFils, { currency: false }) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatFils(r.balance, { currency: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            sentence={pot === "cash" ? "Every payment, sale, expense and salary in cash shows here by itself. Start with the cash in the drawer today." : "Card, transfer and cheque money shows here by itself as it comes in and goes out."}
            action={pot === "cash" ? <LinkButton href="/settings/opening" variant="outline">Enter opening cash</LinkButton> : undefined}
          />
        )}
      </section>

      {closes.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-medium">Daily closes</h2>
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {closes.map((c) => (
              <li key={c.id} className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[14px]">
                <span className="w-28 font-semibold">{formatISODate(c.closeDate, true)}</span>
                <span className="text-ink-muted">Counted {formatFils(c.countedCashFils)}</span>
                <span className="text-ink-muted">Card {formatFils(c.cardTotalFils)}</span>
                <span className={cn("ml-auto font-semibold", c.differenceFils ? "text-brand" : "text-[#4d7a12]")}>
                  {c.differenceFils ? `${c.differenceFils > 0 ? "Over" : "Short"} ${formatFils(Math.abs(c.differenceFils))}` : "Matched"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
