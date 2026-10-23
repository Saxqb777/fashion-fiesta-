import { getSettings } from "./settings";
import { todayISO } from "./dates";
import { customersTable, lastMonths, owesReport, pnlTable, salesByCustomer, salesByMonth, tailorScorecard, vatPeriods, vatTables, type Table } from "./reports";

export const REPORT_NAMES = ["owes", "sales", "vat", "profit", "tailors", "customers", "corporate"] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

/** The VAT quarter picked by `?q=` (its start date), else the current one. */
export async function pickVatPeriod(q: string | null | undefined) {
  const settings = await getSettings();
  const periods = vatPeriods(todayISO(), settings.vatPeriodStartMonth, 8);
  return { periods, period: periods.find((p) => p.start === q) ?? periods[0], startMonth: settings.vatPeriodStartMonth };
}

/** The month picked by `?m=` (YYYY-MM), else this month. Only the last 12 months. */
export function pickMonth(m: string | null | undefined) {
  const months = lastMonths(todayISO(), 12).reverse();
  return { months, month: months.find((x) => x === m) ?? months[0] };
}

/** Every report as tables, the same data on screen and in the Excel download. */
export async function reportTables(name: ReportName, params: URLSearchParams): Promise<Table[]> {
  const today = todayISO();
  switch (name) {
    case "owes":
      return [await owesReport()];
    case "sales":
      return Promise.all([salesByMonth(today), salesByCustomer(today)]);
    case "vat":
      return vatTables((await pickVatPeriod(params.get("q"))).period);
    case "profit":
      return [await pnlTable(pickMonth(params.get("m")).month)];
    case "tailors":
      return [await tailorScorecard(today)];
    case "customers":
      return [await customersTable(today, params.get("show") === "quiet")];
    case "corporate": {
      const { corporatePack, corporateYears } = await import("./tax/corporate");
      const years = await corporateYears();
      const y = Number(params.get("y"));
      const pack = await corporatePack(years.includes(y) ? y : years[0]);
      return [
        { title: `Profit and loss ${pack.year}`, columns: [{ key: "label", title: "" }, { key: "amount", title: "AED", kind: "money" }], rows: pack.lines.map((l) => ({ label: l.label, amount: l.amount })) },
        {
          title: "Small Business Relief",
          columns: [{ key: "k", title: "" }, { key: "v", title: "" }],
          rows: [
            { k: "Revenue", v: (pack.revenue / 100).toFixed(2) },
            { k: "Result", v: pack.sbr.headline },
            { k: "Why", v: pack.sbr.text },
            { k: "Tax without the relief, about", v: (pack.taxWithoutRelief / 100).toFixed(2) },
          ],
        },
        { title: "For the accountant", columns: [{ key: "label", title: "Item" }, { key: "value", title: "From the app" }], rows: pack.checklist.map((c) => ({ label: c.label, value: c.value ?? "Ask the owner" })) },
      ];
    }
  }
}
