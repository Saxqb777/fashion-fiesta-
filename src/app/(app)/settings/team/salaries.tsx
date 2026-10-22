import Link from "next/link";
import { AdvanceButton, PayButton, SetSalaryButton } from "@/components/team/salary-actions";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { monthLabel, salaryOverview } from "@/lib/salaries";
import { SettingsSection } from "../settings-section";

type Person = { id: string; name: string; role: "owner" | "tailor"; isActive: boolean; salaryFils: number | null; payDay: number | null };

/** Pay day, advances and history for everyone on a salary. */
export async function Salaries({ people, today }: { people: Person[]; today: string }) {
  const overview = await salaryOverview(today);
  const active = people.filter((p) => p.isActive);
  const unpaid = overview.filter((o) => o.daysUntil <= 3);
  return (
    <SettingsSection
      title="Salaries"
      description={
        unpaid.length
          ? `${formatFils(unpaid.reduce((s, o) => s + Math.max(0, o.salaryFils - Math.min(o.advanceFils, o.salaryFils)), 0))} to hand over for ${unpaid.length} ${unpaid.length === 1 ? "person" : "people"} by ${formatISODate(unpaid.reduce((m, o) => (o.due < m ? o.due : m), unpaid[0].due), true)}.`
          : "Each person's salary, pay day and advances. Paying writes the cash book and an expense."
      }
    >
      <ul className="flex flex-col gap-2">
        {active.map((p) => {
          const o = overview.find((x) => x.id === p.id);
          return (
            <li key={p.id} className="flex flex-col gap-2 rounded-[14px] border border-line px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link href={`/settings/team/${p.id}`} className="text-[15px] font-semibold hover:underline">
                  {p.name}
                </Link>
                {o ? (
                  <p className="tabular text-[13px] text-ink-muted">
                    {formatFils(o.salaryFils)} a month, day {o.payDay}.{" "}
                    <span className={o.daysUntil < 0 ? "font-semibold text-brand" : o.daysUntil <= 3 ? "font-semibold text-ink" : undefined}>
                      {monthLabel(o.month).split(" ")[0]} due {formatISODate(o.due)}
                      {o.daysUntil < 0 ? `, ${-o.daysUntil} days late` : o.daysUntil === 0 ? ", today" : o.daysUntil <= 3 ? `, in ${o.daysUntil} days` : ""}.
                    </span>
                    {o.advanceFils > 0 ? <span className="text-magenta"> {formatFils(o.advanceFils)} in advances.</span> : null}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-muted">No salary in the app.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {o ? (
                  <>
                    <PayButton person={{ ...p, salaryFils: o.salaryFils }} month={o.month} monthLabel={monthLabel(o.month)} advanceFils={o.advanceFils} today={today} urgent={o.daysUntil <= 3} />
                    <AdvanceButton person={p} today={today} />
                  </>
                ) : null}
                <SetSalaryButton person={p} />
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}
