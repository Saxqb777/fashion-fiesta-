import { TIME_ZONE } from "./defaults";

export function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Today's date in Abu Dhabi as YYYY-MM-DD. */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatISODate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
}

/** "Overdue 3 days", "Due today", "Due tomorrow", "Due 14 Nov". */
export function dueLabel(iso: string | null | undefined, today = todayISO()) {
  if (!iso) return null;
  const diff = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (diff < 0) return { text: `Overdue ${-diff} ${diff === -1 ? "day" : "days"}`, tone: "overdue" as const };
  if (diff === 0) return { text: "Due today", tone: "today" as const };
  if (diff === 1) return { text: "Due tomorrow", tone: "soon" as const };
  return { text: `Due ${formatISODate(iso)}`, tone: diff <= 3 ? ("soon" as const) : ("later" as const) };
}
