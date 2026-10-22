import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { del, list, put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { todayISO } from "./dates";

/** Columns never exported. */
const SECRET_COLUMNS = new Set(["password_hash"]);
const KEEP_DAYS = 30;
export const BACKUP_PREFIX = "backups/";

type Cell = string | number | boolean | Date | null;

function cell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Every table, one sheet each, as an Excel workbook. Password hashes are left out. */
export async function buildWorkbook(): Promise<{ buffer: Buffer; tables: number; rows: number }> {
  const cols = await db.execute<{ table_name: string; column_name: string }>(sql`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position
  `);
  const byTable = new Map<string, string[]>();
  for (const r of cols.rows) {
    if (SECRET_COLUMNS.has(r.column_name)) continue;
    byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), r.column_name]);
  }
  const sheets = [];
  let rows = 0;
  for (const [table, columns] of byTable) {
    // Names come from the database catalogue, quoted as identifiers.
    const list = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
    const data = await db.execute<Record<string, unknown>>(sql.raw(`select ${list} from "${table.replace(/"/g, '""')}"`));
    rows += data.rows.length;
    sheets.push({
      sheet: table.slice(0, 31),
      data: [columns.map((c) => ({ value: c, fontWeight: "bold" as const })), ...data.rows.map((r) => columns.map((c) => ({ value: cell(r[c]) })))],
      stickyRowsCount: 1,
    });
  }
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const buffer = await writeXlsxFile(sheets as never).toBuffer();
  return { buffer, tables: sheets.length, rows };
}

function key() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`${process.env.AUTH_SECRET}:backup`).digest();
}

/** Backups sit in the photo store, so they are encrypted: only this app can open them. */
export function encrypt(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(data: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

/** Nightly: save everything, then drop copies older than 30 days. */
export async function runBackup() {
  const { buffer, tables, rows } = await buildWorkbook();
  const blob = await put(`${BACKUP_PREFIX}fashion-fiesta-${todayISO()}.xlsx.enc`, encrypt(buffer), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/octet-stream",
  });
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const all = await listBackups();
  const old = all.filter((b) => b.uploadedAt.getTime() < cutoff);
  if (old.length) await del(old.map((b) => b.url));
  return { pathname: blob.pathname, tables, rows, removed: old.length };
}

export async function listBackups() {
  const out = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}
