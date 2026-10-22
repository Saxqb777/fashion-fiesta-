import { z } from "zod";

export type FieldErrors = Record<string, string[] | undefined>;

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Changes on every successful save so forms can react (toast, close dialog). */
  savedAt?: number;
};

export const EMPTY_FORM_STATE: FormState = {};

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

export function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const passwordSchema = z.string().min(8, "Use at least 8 characters.");

export const optionalText = z.string().trim().optional().transform((v) => (v ? v : null));

export type FormMode = "setup" | "settings";

export function modeOf(fd: FormData): FormMode {
  return fd.get("mode") === "setup" ? "setup" : "settings";
}
