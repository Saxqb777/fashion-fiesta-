import type { Metadata } from "next";
import Link from "next/link";
import { practiceAvailable } from "@/db";
import { ResetPracticeButton } from "@/components/practice/reset-button";
import { SettingsSection } from "../settings-section";

export const metadata: Metadata = { title: "How the shop runs now" };

const FLOW = [
  ["Confirmed", "Each line goes to a tailor or to the Ajman unit. Tailors see it on their phone straight away."],
  ["Stitching", "Tailors cut, tap Fabric taken, update pieces done and send a photo when finished."],
  ["Ready", "You approve each task. When all of it is approved the order turns Ready by itself."],
  ["Delivered", "Make the delivery note at the counter, or plan a delivery run for a key account."],
  ["Invoiced", "Make the Tax Invoice from the order. Send it on WhatsApp or by email from the invoice."],
  ["Paid", "Record the payment. Deposits taken earlier print on the invoice as paid in advance."],
] as const;

const STARTS = [
  ["Type it", "New order, pick the customer, type any item, quantity and price. New items are added to your products by themselves."],
  ["From Excel", "Add lines from Excel on a new order. A Branch column makes one draft per branch."],
  ["Read their document", "Upload their PO, a photo, a screenshot or a handwritten slip. Check the lines, then save."],
  ["From a quote", "Send a quote first. When they say yes, Confirm the quote as an order. Order again copies any past order."],
] as const;

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[180px_1fr] sm:gap-6">
      <dt className="text-[15px] font-semibold">{term}</dt>
      <dd className="text-[15px] text-ink-muted">{children}</dd>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Handover</p>
        <h2 className="mt-1 font-display text-[1.75rem] leading-tight font-medium">How the shop runs now</h2>
        <p className="mt-2 max-w-prose text-[15px] text-ink-muted">One page for both owners. Everything here can also be tried first in Practice, from the switch at the top.</p>
      </section>

      <SettingsSection title="Four ways an order starts" description="All four end on the same order screen, so you check one thing before saving.">
        <dl>
          {STARTS.map(([t, d]) => (
            <Item key={t} term={t}>
              {d}
            </Item>
          ))}
        </dl>
      </SettingsSection>

      <SettingsSection title="From order to money" description="Every order shows where it is. The button under the red stage is always the next thing to do.">
        <ol className="flex flex-col">
          {FLOW.map(([stage, text], i) => (
            <li key={stage} className="relative flex gap-4 pb-4 last:pb-0">
              {i < FLOW.length - 1 ? <span aria-hidden className="absolute top-6 left-[11px] h-full w-0.5 bg-line" /> : null}
              <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-surface text-[11px] font-bold text-brand-deep tabular">{i + 1}</span>
              <div>
                <p className="text-[15px] font-semibold">{stage}</p>
                <p className="text-[15px] text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[14px] text-ink-muted">Walk ins can be invoiced and paid in one step from the order. A Tax Invoice is never edited: corrections are a Credit Note.</p>
      </SettingsSection>

      <SettingsSection title="Every day, every month">
        <dl>
          <Item term="Close the day">
            At closing, open <Link href="/money/cash" className="font-semibold text-ink underline underline-offset-2">Money, Cash book</Link>, count the drawer and type the total. Red means it does not match: add a note.
          </Item>
          <Item term="Salaries">
            Today warns before pay day. Pay each tailor from <Link href="/settings/team" className="font-semibold text-ink underline underline-offset-2">Settings, Team</Link>. Advances come off by themselves.
          </Item>
          <Item term="VAT quarter">
            After each quarter, open <Link href="/reports/vat" className="font-semibold text-ink underline underline-offset-2">Reports, VAT</Link>. The boxes match the return on EmaraTax. Download the Excel for the accountant and file by the 28th of the next month. The quarter start month is in Settings, Money.
          </Item>
          <Item term="Who owes you">Money opens on it. Email statements to several customers at once, or send one on WhatsApp.</Item>
        </dl>
      </SettingsSection>

      {practiceAvailable() ? (
        <SettingsSection title="Practice" description="A copy of the shop with three months of made up work. Nothing in it touches the real shop, sends a real email or reaches a customer.">
          <p className="mb-4 text-[15px] text-ink-muted">Switch with Live and Practice at the top of the screen. Practice tailor logins: ahmed@practice.ff, imran@practice.ff and sajid@practice.ff, password practice1.</p>
          <ResetPracticeButton />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Who to call">
        <p className="text-[15px]">
          <span className="font-semibold">Saaqib</span>
          <span className="text-ink-muted">: anything about the app, a new idea, or something that looks wrong. Send a screenshot on WhatsApp.</span>
        </p>
      </SettingsSection>
    </div>
  );
}
