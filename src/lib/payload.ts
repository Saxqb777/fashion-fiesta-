import { z } from "zod";
import type { FieldErrors } from "./forms";

/** Zod issues to { "lines.0.qty": ["..."] } so the editor can show errors next to the right line. */
export function issuesToErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export const isoDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date.")
  .transform((v) => (v ? v : null));

export const uuidOrNull = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f-]{36}$/.test(v), "Invalid reference.");
