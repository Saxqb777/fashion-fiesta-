/** Quantities in purchases and stock are hundredths: 1250 = 12.50 m, 300 = 3 pieces. */
import type { QtyUnit } from "@/db/schema";

const fmt = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatQty(centi: number, unit: QtyUnit = "m") {
  if (unit === "pcs") {
    const n = centi / 100;
    return `${Number.isInteger(n) ? n : fmt.format(n)} ${n === 1 ? "piece" : "pieces"}`;
  }
  return `${fmt.format(centi / 100)} m`;
}

export function formatMetres(centi: number) {
  return fmt.format(centi / 100);
}

/** "12.5", "12,50", "3" → hundredths. Empty or invalid → null. */
export function parseCenti(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const centiInput = (centi: number | null | undefined) => (centi ? (centi / 100).toFixed(2) : "");

/** Line maths for a quantity in hundredths and a price per unit in fils. */
export function lineAmountsCenti(qtyCenti: number, unitPriceFils: number, vatRateBp: number) {
  const netFils = Math.round((qtyCenti * unitPriceFils) / 100);
  const vatFils = Math.round((netFils * vatRateBp) / 10000);
  return { netFils, vatFils, totalFils: netFils + vatFils };
}
