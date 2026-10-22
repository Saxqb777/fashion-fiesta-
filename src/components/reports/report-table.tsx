import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import type { Column, Table } from "@/lib/reports";
import { cn } from "cn";

function show(c: Column, v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "";
  switch (c.kind) {
    case "money":
      return formatFils(Number(v), { currency: false });
    case "percent":
      return `${v}%`;
    case "date":
      return formatISODate(String(v), true);
    default:
      return String(v);
  }
}

const numeric = (c: Column) => c.kind === "money" || c.kind === "number" || c.kind === "percent";

/** One report table. The first column names the row; numbers sit right in tabular figures. */
export function ReportTable({ table, hideTitle, className }: { table: Table; hideTitle?: boolean; className?: string }) {
  return (
    <section className={className}>
      {hideTitle ? null : <h2 className="mb-3 text-xl font-medium">{table.title}</h2>}
      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
        <table className="tabular w-full min-w-[560px] text-left text-[14px]">
          <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 whitespace-nowrap", numeric(c) && "text-right")}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {table.columns.map((c, j) => (
                  <td key={c.key} className={cn("px-4 py-2.5", numeric(c) && "text-right whitespace-nowrap", j === 0 && "font-semibold", c.kind === "date" && "whitespace-nowrap text-ink-muted")}>
                    {show(c, r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.totals ? (
            <tfoot>
              <tr className="border-t-2 border-ink/80 bg-paper">
                {table.columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 font-bold", numeric(c) && "text-right whitespace-nowrap")}>
                    {show(c, table.totals?.[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

/** The Excel download for a report, with the page's own filters. */
export function ExcelLink({ name, query }: { name: string; query?: string }) {
  return (
    <a
      href={`/api/reports/${name}${query ? `?${query}` : ""}`}
      className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper-deep"
    >
      Download Excel
    </a>
  );
}
