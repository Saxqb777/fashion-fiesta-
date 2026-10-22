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

/** "45", "45.5", "1,250.00" in AED → integer fils. Empty → 0. */
export const moneySchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 45 or 45.50.")
  .transform((v) => (v === "" ? 0 : Math.round(Number(v) * 100)));

/** Whole days, empty → null. */
export const optionalDays = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,3}$/.test(v), "Whole days, 0 to 365.")
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || v <= 365, "Whole days, 0 to 365.");

export const optionalTrn = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => v === "" || /^\d{15}$/.test(v), "A TRN has 15 digits.")
  .transform((v) => (v ? v : null));

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
  .transform((v) => (v ? v : null));

export const requiredName = (message = "Enter a name.") => z.string().trim().min(2, message);
