import { and, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export function archivedFilter(column: PgColumn, showArchived: boolean): SQL {
  return showArchived ? isNotNull(column) : isNull(column);
}

export function where(...parts: (SQL | undefined | false | null | "")[]) {
  return and(...parts.filter((p): p is SQL => Boolean(p)));
}

/** Escapes % and _ so a search for "50%" means the text, not a pattern. */
export function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
