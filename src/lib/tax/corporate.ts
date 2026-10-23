import { sql } from "drizzle-orm";
import { db } from "@/db";
import { todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { profitAndLoss } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

/**
 * Corporate tax pack (idea 27). The financial year is the calendar year.
 * Small Business Relief: revenue up to AED 3,000,000, for tax periods ending by 31 December 2026.
 * Without it: 0 percent up to AED 375,000 of taxable income, 9 percent above.
 */

const SBR_LIMIT = 300_000_000;
const ZERO_BAND = 37_500_000;
const SBR_LAST_YEAR = 2026;
const n = (v: unknown) => Number(v ?? 0);

export type CorporatePack = Awaited<ReturnType<typeof corporatePack>>;

/** Years from the go live year to this year, newest first. */
export async function corporateYears() {
  const settings = await getSettings();
  const now = Number(todayISO().slice(0, 4));
  const first = Math.min(now, Number((settings.openingDate ?? todayISO()).slice(0, 4)));
  return Array.from({ length: now - first + 1 }, (_, i) => now - i);
}

export async function corporatePack(year: number) {
  const settings = await getSettings();
  const today = todayISO();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const asOf = end < today ? end : today;
  const running = end >= today;
  const opening = settings.openingDate ?? start;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).filter((m) => `${m}-01` <= today);
  const monthly = await Promise.all(months.map((m) => profitAndLoss(m)));
  const monthsWithData = months.filter((m) => `${m}-31` >= opening).length;

  // Same lines as the monthly P&L, added up over the year.
  const lines = (monthly[0]?.lines ?? (await profitAndLoss(`${year}-01`)).lines).map((l, i) => ({ label: l.label, kind: l.kind, amount: monthly.reduce((t, p) => t + p.lines[i].amount, 0) }));
  const profit = lines.find((l) => l.kind === "total")?.amount ?? 0;
  const revenue = lines.filter((l) => l.kind === "in").reduce((t, l) => t + l.amount, 0);
  const taxWithoutRelief = Math.max(0, Math.round((profit - ZERO_BAND) * 0.09));

  const sofar = running ? " The year is still running, so these are the figures so far." : "";
  const sbr =
    year > SBR_LAST_YEAR
      ? {
          eligible: false,
          headline: "Small Business Relief has ended",
          text: `The relief covers tax years ending by 31 December ${SBR_LAST_YEAR}, unless the Ministry of Finance extends it. For ${year} corporate tax applies: 0 percent up to AED 375,000 of taxable income, 9 percent above.${sofar}`,
        }
      : revenue <= SBR_LIMIT
        ? {
            eligible: true,
            headline: "Small Business Relief looks available",
            text: `Revenue for ${year} is ${formatFils(revenue)}, under AED 3,000,000. The shop can elect the relief in the corporate tax return, and then no corporate tax is due for ${year}. Revenue must also have stayed under AED 3,000,000 in every earlier year. Your accountant makes the election on EmaraTax.${sofar}`,
          }
        : {
            eligible: false,
            headline: "Revenue is over the relief limit",
            text: `Revenue for ${year} is ${formatFils(revenue)}, over AED 3,000,000, so Small Business Relief does not apply. Corporate tax is 0 percent up to AED 375,000 of taxable income and 9 percent above.${sofar}`,
          };

  const [r] = (
    await db.execute<{ owed_to_us: number; we_owe: number; cash: number; bank: number; stock: number }>(sql`
      select
        ((select coalesce(sum(total_fils), 0) from invoices where invoice_date <= ${asOf})
          - (select coalesce(sum(a.amount_fils), 0) from payment_allocations a join payments p on p.id = a.payment_id where p.payment_date <= ${asOf})
          - (select coalesce(sum(total_fils), 0) from credit_notes where credit_date <= ${asOf}))::bigint owed_to_us,
        ((select coalesce(sum(total_fils), 0) from supplier_bills where bill_date <= ${asOf})
          - (select coalesce(sum(amount_fils), 0) from supplier_payments where payment_date <= ${asOf}))::bigint we_owe,
        (select coalesce(sum(amount_fils), 0) from cash_book where pot = 'cash' and entry_date <= ${asOf})::bigint cash,
        (select coalesce(sum(amount_fils), 0) from cash_book where pot = 'bank' and entry_date <= ${asOf})::bigint bank,
        (select coalesce(sum(round(x.qty * f.cost_fils / 100.0)), 0) from fabrics f
          join (select fabric_id, sum(qty_centi) qty from stock_movements where moved_on <= ${asOf} group by fabric_id) x on x.fabric_id = f.id
          where x.qty > 0)::bigint stock`)
  ).rows;

  const at = running ? "today" : "31 Dec";
  const checklist: { label: string; value: string | null }[] = [
    { label: "Corporate tax registration number", value: settings.ctTrn },
    { label: "Revenue for the year, for the relief test", value: formatFils(revenue) },
    { label: "Operating profit from the app", value: formatFils(profit) },
    { label: `Who owes you, ${at}`, value: formatFils(n(r.owed_to_us)) },
    { label: `Who you owe, ${at}`, value: formatFils(n(r.we_owe)) },
    { label: `Cash in the drawer, ${at}`, value: formatFils(n(r.cash)) },
    { label: `Bank, ${at}, from the cash book`, value: formatFils(n(r.bank)) },
    { label: `Fabric on the shelf at cost, ${at}`, value: formatFils(n(r.stock)) },
    { label: "Bank statements for the year", value: null },
    { label: "Equipment bought (machines, furniture) with invoices", value: null },
    { label: "Loans, and money the owner put in or took out", value: null },
    { label: "Rent contract and trade licence renewal", value: null },
  ];

  const returnDue = `${year + 1}-09-30`;
  return { year, start, end, running, returnDue, lines, profit, revenue, monthsWithData, sbr, taxWithoutRelief, checklist };
}
