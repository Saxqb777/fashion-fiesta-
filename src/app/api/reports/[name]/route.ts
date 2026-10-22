import { auth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { REPORT_NAMES, reportTables, type ReportName } from "@/lib/report-registry";
import type { Table } from "@/lib/reports";

export const runtime = "nodejs";

/** Money stays a number in AED so the accountant can add it up in Excel. */
function cell(t: Table, key: string, v: string | number | null) {
  const kind = t.columns.find((c) => c.key === key)?.kind;
  if (v === null || v === "") return null;
  if (kind === "money" && typeof v === "number") return { value: v / 100, format: "#,##0.00" };
  if (kind === "percent" && typeof v === "number") return { value: v / 100, format: "0.0%" };
  return { value: v };
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  const { name } = await params;
  if (!REPORT_NAMES.includes(name as ReportName)) return new Response("Not found", { status: 404 });
  const tables = await reportTables(name as ReportName, new URL(request.url).searchParams);
  const used = new Set<string>();
  const sheets = tables.map((t) => {
    let sheet = t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim();
    while (used.has(sheet)) sheet = `${sheet.slice(0, 29)} ${used.size}`;
    used.add(sheet);
    const head = t.columns.map((c) => ({ value: c.title, fontWeight: "bold" as const }));
    const body = t.rows.map((r) => t.columns.map((c) => cell(t, c.key, r[c.key] ?? null)));
    const foot = t.totals ? [t.columns.map((c) => ({ ...cell(t, c.key, t.totals?.[c.key] ?? null), fontWeight: "bold" as const }))] : [];
    return { sheet, data: [head, ...body, ...foot], stickyRowsCount: 1, columns: t.columns.map((c, i) => ({ width: i === 0 ? 34 : 18 })) };
  });
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const buffer = await writeXlsxFile(sheets as never).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fashion-fiesta-${name}-${todayISO()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
